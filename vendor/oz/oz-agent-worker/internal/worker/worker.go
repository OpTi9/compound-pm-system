package worker

import (
	"archive/tar"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/distribution/reference"
	cliconfig "github.com/docker/cli/cli/config"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
	"github.com/docker/docker/registry"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
	"github.com/warpdotdev/oz-agent-worker/internal/common"
	"github.com/warpdotdev/oz-agent-worker/internal/log"
	"github.com/warpdotdev/oz-agent-worker/internal/types"
)

const (
	InitialReconnectDelay = 1 * time.Second
	MaxReconnectDelay     = 60 * time.Second
	ReconnectBackoffRate  = 2.0

	HeartbeatInterval = 30 * time.Second
	PongWait          = 60 * time.Second
	WriteWait         = 10 * time.Second
)

type ExecutionResult struct {
	Output      string
	Artifacts   json.RawMessage
	SessionLink string
	ExitCode    int64
}

type Config struct {
	APIKey        string
	WorkerID      string
	WebSocketURL  string
	ServerRootURL string
	LogLevel      string
	NoCleanup     bool
	Volumes       []string
}

type Worker struct {
	config         Config
	conn           *websocket.Conn
	connMutex      sync.Mutex
	ctx            context.Context
	cancel         context.CancelFunc
	reconnectDelay time.Duration
	lastHeartbeat  time.Time
	sendChan       chan []byte
	activeTasks    map[string]context.CancelFunc
	tasksMutex     sync.Mutex
	dockerClient   *client.Client
	platform       string // Docker daemon platform (e.g., "linux/amd64" or "linux/arm64")
}

func New(ctx context.Context, config Config) (*Worker, error) {
	workerCtx, cancel := context.WithCancel(ctx)

	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	pingCtx, pingCancel := context.WithTimeout(ctx, 5*time.Second)
	defer pingCancel()

	// Ping the Docker daemon to ensure it's reachable, as we depend on this.
	if _, err := dockerClient.Ping(pingCtx); err != nil {
		if closeErr := dockerClient.Close(); closeErr != nil {
			log.Warnf(ctx, "Failed to close Docker client: %v", closeErr)
		}
		cancel()
		return nil, fmt.Errorf("failed to reach Docker daemon: %w", err)
	}

	// Get the Docker daemon version to determine its platform.
	versionInfo, err := dockerClient.ServerVersion(ctx)
	if err != nil {
		if closeErr := dockerClient.Close(); closeErr != nil {
			log.Warnf(ctx, "Failed to close Docker client: %v", closeErr)
		}
		cancel()
		return nil, fmt.Errorf("failed to get Docker version: %w", err)
	}

	// Determine the platform. The sidecar only supports linux/amd64 and linux/arm64,
	// so we enforce that all images are pulled for one of these platforms.
	platform := fmt.Sprintf("%s/%s", versionInfo.Os, versionInfo.Arch)
	if platform != "linux/amd64" && platform != "linux/arm64" {
		if closeErr := dockerClient.Close(); closeErr != nil {
			log.Warnf(ctx, "Failed to close Docker client: %v", closeErr)
		}
		cancel()
		return nil, fmt.Errorf("unsupported Docker platform %s (only linux/amd64 and linux/arm64 are supported)", platform)
	}

	log.Debugf(ctx, "Docker daemon is reachable, platform: %s", platform)

	return &Worker{
		config:         config,
		ctx:            workerCtx,
		cancel:         cancel,
		reconnectDelay: InitialReconnectDelay,
		sendChan:       make(chan []byte, 256),
		activeTasks:    make(map[string]context.CancelFunc),
		dockerClient:   dockerClient,
		platform:       platform,
	}, nil
}

func (w *Worker) Start() error {
	for {
		select {
		case <-w.ctx.Done():
			return w.ctx.Err()
		default:
		}

		if err := w.connect(); err != nil {
			log.Errorf(w.ctx, "Failed to connect: %v, retrying in %v", err, w.reconnectDelay)
			time.Sleep(w.reconnectDelay)

			// Compute exponential back-off.
			w.reconnectDelay = min(time.Duration(float64(w.reconnectDelay)*ReconnectBackoffRate), MaxReconnectDelay)
			continue
		}

		w.reconnectDelay = InitialReconnectDelay

		w.run()
	}
}

func (w *Worker) connect() error {
	u, err := url.Parse(w.config.WebSocketURL)
	if err != nil {
		return fmt.Errorf("invalid WebSocket URL: %w", err)
	}

	query := u.Query()
	query.Set("worker_id", w.config.WorkerID)
	u.RawQuery = query.Encode()

	headers := make(map[string][]string)
	headers["Authorization"] = []string{fmt.Sprintf("Bearer %s", w.config.APIKey)}

	log.Infof(w.ctx, "Connecting to %s", u.String())

	conn, resp, err := websocket.DefaultDialer.Dial(u.String(), headers)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("failed to dial WebSocket: %w\n%s", err, resp.Status)
		}
		return fmt.Errorf("failed to dial WebSocket: %w", err)
	}

	w.connMutex.Lock()
	w.conn = conn
	w.connMutex.Unlock()

	log.Infof(w.ctx, "Successfully connected to server")

	conn.SetPongHandler(func(string) error {
		w.lastHeartbeat = time.Now()
		if err := conn.SetReadDeadline(time.Now().Add(PongWait)); err != nil {
			log.Warnf(w.ctx, "Failed to set read deadline in pong handler: %v", err)
		}
		return nil
	})

	return nil
}

func (w *Worker) run() {
	done := make(chan struct{})

	go w.readLoop(done)
	go w.writeLoop(done)
	go w.heartbeatLoop(done)

	<-done

	w.connMutex.Lock()
	if w.conn != nil {
		if err := w.conn.Close(); err != nil {
			log.Warnf(w.ctx, "Error closing connection: %v", err)
		}
		w.conn = nil
	}
	w.connMutex.Unlock()

	log.Warnf(w.ctx, "Connection closed, will attempt to reconnect")
}

func (w *Worker) readLoop(done chan struct{}) {
	defer close(done)

	for {
		select {
		case <-w.ctx.Done():
			return
		default:
		}

		w.connMutex.Lock()
		conn := w.conn
		w.connMutex.Unlock()

		if conn == nil {
			return
		}

		if err := conn.SetReadDeadline(time.Now().Add(PongWait)); err != nil {
			log.Errorf(w.ctx, "Failed to set read deadline: %v", err)
			return
		}
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Errorf(w.ctx, "WebSocket read error: %v", err)
			}
			return
		}

		log.Debugf(w.ctx, "WebSocket received: %s", string(message))

		w.handleMessage(message)
	}
}

func (w *Worker) writeLoop(done chan struct{}) {
	for {
		select {
		case <-w.ctx.Done():
			return
		case <-done:
			return
		case message := <-w.sendChan:
			w.connMutex.Lock()
			conn := w.conn
			w.connMutex.Unlock()

			if conn == nil {
				return
			}

			log.Debugf(w.ctx, "WebSocket sending: %s", string(message))

			if err := conn.SetWriteDeadline(time.Now().Add(WriteWait)); err != nil {
				log.Errorf(w.ctx, "Failed to set write deadline: %v", err)
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Errorf(w.ctx, "WebSocket write error: %v", err)
				return
			}
		}
	}
}

func (w *Worker) heartbeatLoop(done chan struct{}) {
	ticker := time.NewTicker(HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-w.ctx.Done():
			return
		case <-done:
			return
		case <-ticker.C:
			w.connMutex.Lock()
			conn := w.conn
			w.connMutex.Unlock()

			if conn == nil {
				return
			}

			if err := conn.SetWriteDeadline(time.Now().Add(WriteWait)); err != nil {
				log.Errorf(w.ctx, "Failed to set write deadline: %v", err)
				return
			}
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Errorf(w.ctx, "Failed to send ping: %v", err)
				return
			}
		}
	}
}

func (w *Worker) handleMessage(message []byte) {
	log.Debugf(w.ctx, "Received message: %s", string(message))

	var msg types.WebSocketMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		log.Errorf(w.ctx, "Failed to unmarshal message: %v", err)
		return
	}

	// Currently there is only one message type, but we anticipate needing more in the future.
	switch msg.Type {
	case types.MessageTypeTaskAssignment:
		var assignment types.TaskAssignmentMessage
		if err := json.Unmarshal(msg.Data, &assignment); err != nil {
			log.Errorf(w.ctx, "Failed to unmarshal task assignment: %v", err)
			return
		}
		w.handleTaskAssignment(&assignment)

	default:
		log.Warnf(w.ctx, "Unknown message type: %s", msg.Type)
	}
}

func (w *Worker) handleTaskAssignment(assignment *types.TaskAssignmentMessage) {
	log.Infof(w.ctx, "Received task assignment: taskID=%s, title=%s", assignment.TaskID, assignment.Task.Title)

	// It's important to update the task state to claimed as the task lifecycle treats this as a dependency to advance to further states.
	if err := w.sendTaskClaimed(assignment.TaskID); err != nil {
		log.Errorf(w.ctx, "Failed to send task claimed message: %v", err)
	}

	taskCtx, taskCancel := context.WithCancel(w.ctx)

	w.tasksMutex.Lock()
	w.activeTasks[assignment.TaskID] = taskCancel
	w.tasksMutex.Unlock()

	go w.executeTask(taskCtx, assignment)
}

func (w *Worker) executeTask(ctx context.Context, assignment *types.TaskAssignmentMessage) {
	defer func() {
		w.tasksMutex.Lock()
		delete(w.activeTasks, assignment.TaskID)
		w.tasksMutex.Unlock()
	}()

	taskID := assignment.TaskID
	log.Infof(ctx, "Starting task execution: taskID=%s, title=%s", taskID, assignment.Task.Title)

	result, err := w.executeTaskInDocker(ctx, assignment)
	if err != nil {
		log.Errorf(ctx, "Task failed: taskID=%s, error=%v", taskID, err)
		if statusErr := w.sendTaskFailed(taskID, fmt.Sprintf("Task failed: %v", err), result.Output, result.Artifacts, result.SessionLink); statusErr != nil {
			log.Errorf(ctx, "Failed to send task failed message: %v", statusErr)
		}
		return
	}

	if statusErr := w.sendTaskCompleted(taskID, result.Output, result.ExitCode, result.Artifacts, result.SessionLink); statusErr != nil {
		log.Errorf(ctx, "Failed to send task completed message: %v", statusErr)
	}
	if result.ExitCode == 0 {
		log.Infof(ctx, "Task completed successfully: taskID=%s", taskID)
	} else {
		log.Warnf(ctx, "Task completed with non-zero exit code: taskID=%s, exitCode=%d", taskID, result.ExitCode)
	}
}

// pullImage pulls a Docker image. If authStr is non-empty, it will be used for registry authentication.
// Docker only downloads changed layers, so this is efficient even if the image exists locally.
func (w *Worker) pullImage(ctx context.Context, imageName string, authStr string) error {
	log.Infof(ctx, "Pulling image: %s", imageName)
	pullOptions := image.PullOptions{
		Platform:     w.platform,
		RegistryAuth: authStr,
	}
	reader, err := w.dockerClient.ImagePull(ctx, imageName, pullOptions)
	if err != nil {
		return fmt.Errorf("failed to pull image %s: %w", imageName, err)
	}
	defer func() {
		if closeErr := reader.Close(); closeErr != nil {
			log.Warnf(ctx, "Failed to close image pull reader: %v", closeErr)
		}
	}()

	// The image pull doesn't actually happen until you read from this stream, but we don't need the output.
	if _, err = io.Copy(io.Discard, reader); err != nil {
		return fmt.Errorf("failed to read image pull output: %w", err)
	}
	log.Infof(ctx, "Successfully pulled image: %s", imageName)
	return nil
}

// getRegistryAuth returns the auth string for the registry of the given image, or empty string if not found.
func (w *Worker) getRegistryAuth(ctx context.Context, imageName string) string {
	cfg, err := cliconfig.Load("")
	if err != nil {
		log.Warnf(ctx, "Failed to load Docker config: %v. Attempting pull without auth.", err)
		return ""
	}
	if cfg == nil {
		return ""
	}

	ref, err := reference.ParseNormalizedNamed(imageName)
	if err != nil {
		log.Warnf(ctx, "Failed to parse image name %s: %v", imageName, err)
		return ""
	}

	// Get the registry hostname (e.g., "docker.io", "gcr.io").
	repoInfo, err := registry.ParseRepositoryInfo(ref)
	if err != nil {
		log.Warnf(ctx, "Failed to parse repository info: %v", err)
		return ""
	}

	authKey := registry.GetAuthConfigKey(repoInfo.Index)

	authConfig, err := cfg.GetAuthConfig(authKey)
	if err != nil {
		log.Warnf(ctx, "Failed to get auth config for registry %s: %v", authKey, err)
		return ""
	}
	if authConfig.Username == "" {
		return ""
	}

	authJSON, _ := json.Marshal(authConfig)
	log.Debugf(ctx, "Using Docker credentials for registry %s (username: %s)", authKey, authConfig.Username)
	return base64.URLEncoding.EncodeToString(authJSON)
}

func (w *Worker) executeTaskInDocker(ctx context.Context, assignment *types.TaskAssignmentMessage) (ExecutionResult, error) {
	task := assignment.Task
	dockerClient := w.dockerClient
	result := ExecutionResult{ExitCode: -1}

	var imageName string
	if assignment.DockerImage != "" {
		imageName = assignment.DockerImage
		log.Debugf(ctx, "Using Docker image from assignment: %s", imageName)
	} else {
		imageName = "ubuntu:22.04"
		if task.AgentConfigSnapshot.EnvironmentID != nil {
			log.Warnf(ctx, "Environment %s specified but no Docker image resolved. Using default: %s",
				*task.AgentConfigSnapshot.EnvironmentID, imageName)
		} else {
			log.Infof(ctx, "No environment specified, using default image: %s", imageName)
		}
	}

	authStr := w.getRegistryAuth(ctx, imageName)
	if err := w.pullImage(ctx, imageName, authStr); err != nil {
		return result, err
	}

	if assignment.SidecarImage == "" {
		return result, fmt.Errorf("no sidecar image specified in assignment")
	}

	// Sidecar images are public, so no auth is needed
	if err := w.pullImage(ctx, assignment.SidecarImage, ""); err != nil {
		return result, err
	}

	// Get the concrete image digest to ensure volume is rebuilt when the image changes
	sidecarDigest, err := w.getImageDigest(ctx, assignment.SidecarImage)
	if err != nil {
		return result, fmt.Errorf("failed to get sidecar image digest: %w", err)
	}

	volumeName := sanitizeVolumeName(assignment.SidecarImage, sidecarDigest)
	log.Debugf(ctx, "Using shared volume: %s", volumeName)

	_, err = dockerClient.VolumeInspect(ctx, volumeName)
	if err == nil {
		log.Debugf(ctx, "Reusing existing volume %s (already populated from sidecar)", volumeName)
	} else {
		log.Infof(ctx, "Creating new Docker volume: %s", volumeName)
		volumeResp, err := dockerClient.VolumeCreate(ctx, volume.CreateOptions{
			Name: volumeName,
		})
		if err != nil {
			return result, fmt.Errorf("failed to create volume: %w", err)
		}
		log.Debugf(ctx, "Created volume: %s at %s", volumeName, volumeResp.Mountpoint)

		log.Debugf(ctx, "Copying warp agent from sidecar to volume (first time)")

		if err := w.copySidecarFilesystemToVolume(ctx, dockerClient, assignment.SidecarImage, volumeName); err != nil {
			return result, fmt.Errorf("failed to copy sidecar to volume: %w", err)
		}
	}

	// Prepare additional sidecar volumes (e.g., xvfb for computer use).
	additionalSidecarBinds, err := w.prepareAdditionalSidecars(ctx, dockerClient, assignment.AdditionalSidecars)
	if err != nil {
		return result, err
	}

	envVars := []string{
		fmt.Sprintf("TASK_ID=%s", task.ID),
		"GIT_TERMINAL_PROMPT=0",
		"GH_PROMPT_DISABLED=1",
	}

	for key, value := range assignment.EnvVars {
		envVars = append(envVars, fmt.Sprintf("%s=%s", key, value))
	}

	cmd := []string{
		"/bin/sh",
		"/agent/entrypoint.sh",
		"agent",
		"run",
		"--share",
		"team:edit",
		"--task-id",
		task.ID,
		"--sandboxed",
		"--server-root-url",
		w.config.ServerRootURL,
	}

	cmd = common.AugmentArgsForTask(task, cmd)

	log.Debugf(ctx, "Creating Docker container with image=%s", imageName)

	containerConfig := &container.Config{
		Image:      imageName,
		Cmd:        cmd,
		Env:        envVars,
		WorkingDir: "/workspace",
	}

	binds := []string{
		fmt.Sprintf("%s:/agent:ro", volumeName),
	}
	// Add additional sidecar volumes.
	binds = append(binds, additionalSidecarBinds...)
	// Add user-configured volumes.
	binds = append(binds, w.config.Volumes...)

	hostConfig := &container.HostConfig{
		Binds: binds,
	}

	resp, err := dockerClient.ContainerCreate(ctx, containerConfig, hostConfig, nil, nil, "")
	if err != nil {
		return result, fmt.Errorf("failed to create container: %w", err)
	}

	containerID := resp.ID
	log.Debugf(ctx, "Created Docker container: %s", containerID)

	defer func() {
		if containerID != "" && !w.config.NoCleanup {
			if removeErr := dockerClient.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true}); removeErr != nil {
				log.Debugf(ctx, "Container %s already removed or removal failed: %v", containerID, removeErr)
			}
		}
	}()

	if err := dockerClient.ContainerStart(ctx, containerID, container.StartOptions{}); err != nil {
		return result, fmt.Errorf("failed to start container: %w", err)
	}

	log.Debugf(ctx, "Started Docker container: %s", containerID)

	statusCh, errCh := dockerClient.ContainerWait(ctx, containerID, container.WaitConditionNotRunning)
	var exitCode int64 = -1
	var logOutput string
	select {
	case err := <-errCh:
		if err != nil {
			return result, fmt.Errorf("error waiting for container: %w", err)
		}
	case status := <-statusCh:
		log.Debugf(ctx, "Container exited with status code: %d", status.StatusCode)
		exitCode = status.StatusCode
		result.ExitCode = status.StatusCode

		var logErr error
		logOutput, logErr = w.getContainerLogs(ctx, dockerClient, containerID)
		if zerolog.GlobalLevel() <= zerolog.DebugLevel || status.StatusCode != 0 {
			if logErr != nil {
				log.Warnf(ctx, "Failed to get container logs: %v", logErr)
			} else if logOutput != "" {
				if status.StatusCode != 0 {
					log.Infof(ctx, "Container output:\n%s", logOutput)
				} else {
					log.Debugf(ctx, "Container output:\n%s", logOutput)
				}
			}
		}
	}

	// Prefer output written by the sidecar (clean text) over Docker's multiplexed log stream.
	if txt, err := w.copyTextFileFromContainer(ctx, dockerClient, containerID, "/workspace/.oz/agent_output.txt"); err == nil && txt != "" {
		result.Output = txt
	} else {
		result.Output = logOutput
	}

	result.Artifacts, result.SessionLink = extractArtifactsAndSession(result.Output)
	return result, nil
}

func (w *Worker) getContainerLogs(ctx context.Context, dockerClient *client.Client, containerID string) (string, error) {
	out, err := dockerClient.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Timestamps: false,
	})
	if err != nil {
		return "", err
	}
	defer func() {
		if err := out.Close(); err != nil {
			log.Warnf(ctx, "Failed to close container logs reader: %v", err)
		}
	}()

	logBytes, err := io.ReadAll(out)
	if err != nil {
		return "", err
	}

	return string(logBytes), nil
}

func (w *Worker) copyTextFileFromContainer(ctx context.Context, dockerClient *client.Client, containerID, path string) (string, error) {
	rc, _, err := dockerClient.CopyFromContainer(ctx, containerID, path)
	if err != nil {
		return "", err
	}
	defer func() {
		_ = rc.Close()
	}()

	tr := tar.NewReader(rc)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		if h.Typeflag != tar.TypeReg {
			continue
		}
		b, err := io.ReadAll(tr)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}
	return "", fmt.Errorf("no file in tar stream")
}

func extractArtifactsAndSession(output string) (json.RawMessage, string) {
	if output == "" {
		return nil, ""
	}

	// Best-effort session link detection.
	sessionLink := ""
	sessionRe := regexp.MustCompile(`(?i)session[^\\n]*(https?://[^\\s"'<>]+)`)
	if m := sessionRe.FindStringSubmatch(output); len(m) == 2 {
		sessionLink = m[1]
	}

	prRe := regexp.MustCompile(`https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/\\d+`)
	raw := prRe.FindAllString(output, -1)
	seen := make(map[string]bool)
	type prData struct {
		Branch string `json:"branch"`
		URL    string `json:"url"`
	}
	type prArtifact struct {
		ArtifactType string `json:"artifact_type"`
		CreatedAt    string `json:"created_at"`
		Data         prData `json:"data"`
	}

	var artifacts []prArtifact
	now := time.Now().UTC().Format(time.RFC3339)
	for _, u := range raw {
		if seen[u] {
			continue
		}
		seen[u] = true
		artifacts = append(artifacts, prArtifact{
			ArtifactType: "PULL_REQUEST",
			CreatedAt:    now,
			Data: prData{
				Branch: "unknown",
				URL:    u,
			},
		})
	}

	if len(artifacts) == 0 {
		return nil, sessionLink
	}

	b, err := json.Marshal(artifacts)
	if err != nil {
		return nil, sessionLink
	}
	return json.RawMessage(b), sessionLink
}

// copySidecarFilesystemToVolume takes an image and creates a volume from its filesystem.
// We mount this volume into the image for each task as a means of predictably injecting dependencies.
// This is basically the `sidecar_volume` concept in `namespace.so`:
// https://buf.build/namespace/cloud/docs/main:namespace.cloud.compute.v1beta#namespace.cloud.compute.v1beta.ContainerRequest
func (w *Worker) copySidecarFilesystemToVolume(ctx context.Context, dockerClient *client.Client, sidecarImage, volumeName string) error {
	log.Infof(ctx, "Creating temporary container from sidecar image")
	sidecarConfig := &container.Config{
		Image: sidecarImage,
		Cmd:   []string{"true"},
	}

	sidecarHostConfig := &container.HostConfig{
		AutoRemove: true,
	}

	sidecarResp, err := dockerClient.ContainerCreate(ctx, sidecarConfig, sidecarHostConfig, nil, nil, "")
	if err != nil {
		return fmt.Errorf("failed to create sidecar container: %w", err)
	}

	sidecarContainerID := sidecarResp.ID

	log.Infof(ctx, "Created sidecar container: %s", sidecarContainerID)

	// Export the full filesystem of the sidecar.
	tarReader, err := dockerClient.ContainerExport(ctx, sidecarContainerID)
	if err != nil {
		return fmt.Errorf("failed to export sidecar container: %w", err)
	}
	defer func() {
		if err := tarReader.Close(); err != nil {
			log.Warnf(ctx, "Failed to close tar reader: %v", err)
		}
	}()

	log.Infof(ctx, "Extracting sidecar filesystem to volume")

	// Use the sidecar image itself to extract the exported filesystem onto the volume.
	// Override the entrypoint to ensure we only run tar, not the sidecar's default command.
	// Run as root to ensure we have permissions to write to the volume.
	extractConfig := &container.Config{
		Image:        sidecarImage,
		User:         "root",
		Entrypoint:   []string{"/bin/sh", "-c"},
		Cmd:          []string{"tar -x -C /target"},
		StdinOnce:    true,
		OpenStdin:    true,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
	}

	extractHostConfig := &container.HostConfig{
		AutoRemove: true,
		Binds: []string{
			fmt.Sprintf("%s:/target", volumeName),
		},
	}

	extractResp, err := dockerClient.ContainerCreate(ctx, extractConfig, extractHostConfig, nil, nil, "")
	if err != nil {
		return fmt.Errorf("failed to create extraction container: %w", err)
	}

	extractContainerID := extractResp.ID

	log.Infof(ctx, "Created extraction container: %s", extractContainerID)

	attachResp, err := dockerClient.ContainerAttach(ctx, extractContainerID, container.AttachOptions{
		Stdin:  true,
		Stream: true,
	})
	if err != nil {
		return fmt.Errorf("failed to attach to extraction container: %w", err)
	}
	defer attachResp.Close()

	if err := dockerClient.ContainerStart(ctx, extractContainerID, container.StartOptions{}); err != nil {
		return fmt.Errorf("failed to start extraction container: %w", err)
	}

	go func() {
		defer func() {
			if err := attachResp.CloseWrite(); err != nil {
				log.Warnf(ctx, "Failed to close write side of attach: %v", err)
			}
		}()
		if _, err := io.Copy(attachResp.Conn, tarReader); err != nil {
			log.Warnf(ctx, "Error copying tar data: %v", err)
		}
	}()

	statusCh, errCh := dockerClient.ContainerWait(ctx, extractContainerID, container.WaitConditionNotRunning)
	select {
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("error waiting for extraction container: %w", err)
		}
	case status := <-statusCh:
		if status.StatusCode != 0 {
			logOutput, _ := w.getContainerLogs(ctx, dockerClient, extractContainerID)
			return fmt.Errorf("extraction container exited with status %d. Logs: %s", status.StatusCode, logOutput)
		}
		log.Infof(ctx, "Successfully extracted sidecar filesystem to volume %s", volumeName)
	}

	return nil
}

// prepareAdditionalSidecars pulls each additional sidecar image, creates a Docker volume
// from its filesystem, and returns the list of bind mount strings to add to the container.
func (w *Worker) prepareAdditionalSidecars(ctx context.Context, dockerClient *client.Client, sidecars []types.SidecarMount) ([]string, error) {
	var binds []string
	seenMountPaths := make(map[string]bool)

	for _, sidecar := range sidecars {
		if sidecar.Image == "" {
			return nil, fmt.Errorf("additional sidecar has empty image")
		}
		if sidecar.MountPath == "" {
			return nil, fmt.Errorf("additional sidecar %s has empty mount path", sidecar.Image)
		}
		if seenMountPaths[sidecar.MountPath] {
			return nil, fmt.Errorf("duplicate mount path %s for additional sidecar %s", sidecar.MountPath, sidecar.Image)
		}
		seenMountPaths[sidecar.MountPath] = true

		log.Infof(ctx, "Preparing additional sidecar: image=%s, mount=%s", sidecar.Image, sidecar.MountPath)

		// Additional sidecar images are public, so no auth is needed.
		if err := w.pullImage(ctx, sidecar.Image, ""); err != nil {
			return nil, fmt.Errorf("failed to pull additional sidecar image %s: %w", sidecar.Image, err)
		}

		digest, err := w.getImageDigest(ctx, sidecar.Image)
		if err != nil {
			return nil, fmt.Errorf("failed to get digest for additional sidecar image %s: %w", sidecar.Image, err)
		}

		volumeName := sanitizeVolumeName(sidecar.Image, digest)
		log.Debugf(ctx, "Using volume %s for additional sidecar %s", volumeName, sidecar.Image)

		_, err = dockerClient.VolumeInspect(ctx, volumeName)
		if err == nil {
			log.Debugf(ctx, "Reusing existing volume %s for additional sidecar", volumeName)
		} else {
			log.Infof(ctx, "Creating new Docker volume: %s", volumeName)
			if _, err := dockerClient.VolumeCreate(ctx, volume.CreateOptions{Name: volumeName}); err != nil {
				return nil, fmt.Errorf("failed to create volume for additional sidecar %s: %w", sidecar.Image, err)
			}

			if err := w.copySidecarFilesystemToVolume(ctx, dockerClient, sidecar.Image, volumeName); err != nil {
				// Clean up the empty volume so it isn't silently reused on retry.
				if removeErr := dockerClient.VolumeRemove(ctx, volumeName, false); removeErr != nil {
					log.Warnf(ctx, "Failed to clean up volume %s after copy failure: %v", volumeName, removeErr)
				}
				return nil, fmt.Errorf("failed to copy additional sidecar %s to volume: %w", sidecar.Image, err)
			}
		}

		mode := ":ro"
		if sidecar.ReadWrite {
			// Docker defaults to read-write when no mode suffix is provided.
			mode = ""
		}
		binds = append(binds, fmt.Sprintf("%s:%s%s", volumeName, sidecar.MountPath, mode))
	}
	return binds, nil
}

func (w *Worker) sendTaskClaimed(taskID string) error {
	claimed := types.TaskClaimedMessage{
		TaskID:   taskID,
		WorkerID: w.config.WorkerID,
	}

	data, err := json.Marshal(claimed)
	if err != nil {
		return fmt.Errorf("failed to marshal task claimed message: %w", err)
	}

	msg := types.WebSocketMessage{
		Type: types.MessageTypeTaskClaimed,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal websocket message: %w", err)
	}

	return w.sendMessage(msgBytes)
}

func (w *Worker) sendTaskFailed(taskID, message, output string, artifacts json.RawMessage, sessionLink string) error {
	failedMsg := types.TaskFailedMessage{
		TaskID:      taskID,
		Message:     message,
		Output:      output,
		Artifacts:   artifacts,
		SessionLink: sessionLink,
	}

	data, err := json.Marshal(failedMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal task failed message: %w", err)
	}

	msg := types.WebSocketMessage{
		Type: types.MessageTypeTaskFailed,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal websocket message: %w", err)
	}

	return w.sendMessage(msgBytes)
}

func (w *Worker) sendTaskCompleted(taskID, output string, exitCode int64, artifacts json.RawMessage, sessionLink string) error {
	completed := types.TaskCompletedMessage{
		TaskID:      taskID,
		WorkerID:    w.config.WorkerID,
		Output:      output,
		Artifacts:   artifacts,
		SessionLink: sessionLink,
		ExitCode:    exitCode,
	}

	data, err := json.Marshal(completed)
	if err != nil {
		return fmt.Errorf("failed to marshal task completed message: %w", err)
	}

	msg := types.WebSocketMessage{
		Type: types.MessageTypeTaskCompleted,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal websocket message: %w", err)
	}

	return w.sendMessage(msgBytes)
}

func (w *Worker) sendMessage(message []byte) error {
	select {
	case w.sendChan <- message:
		return nil
	case <-time.After(5 * time.Second):
		return fmt.Errorf("timeout sending message")
	case <-w.ctx.Done():
		return fmt.Errorf("worker context cancelled")
	}
}

// sanitizeVolumeName creates a volume name from the image name and digest.
// The digest ensures uniqueness when the image tag points to different content.
func sanitizeVolumeName(imageName, digest string) string {
	var repoName string
	ref, err := reference.ParseNormalizedNamed(imageName)
	if err == nil {
		// Use FamiliarName with TrimNamed to get the repository without tag/digest
		// e.g., "namespace/warp-agent:latest" -> "namespace/warp-agent"
		repoName = reference.FamiliarName(reference.TrimNamed(ref))
	} else {
		// Fallback to original image name if parsing fails
		repoName = imageName
	}

	// Sanitize the repository name for use in volume name
	baseName := strings.ReplaceAll(repoName, "/", "-")

	// digest format is typically "sha256:abc123..."
	parts := strings.Split(digest, ":")
	if len(parts) == 2 {
		// Use first 12 chars of the hash
		hash := parts[1]
		if len(hash) > 12 {
			hash = hash[:12]
		}
		return baseName + "-" + hash
	}
	// Fallback if digest format is unexpected
	return baseName + "-" + strings.ReplaceAll(digest, ":", "-")
}

// getImageDigest returns the digest (sha256 hash) of a pulled image.
func (w *Worker) getImageDigest(ctx context.Context, imageName string) (string, error) {
	inspect, err := w.dockerClient.ImageInspect(ctx, imageName)
	if err != nil {
		return "", fmt.Errorf("failed to inspect image %s: %w", imageName, err)
	}

	// RepoDigests contains the digest from the registry. It's in the format "repo@sha256:hash"
	if len(inspect.RepoDigests) > 0 {
		// Extract just the digest part (sha256:hash)
		parts := strings.Split(inspect.RepoDigests[0], "@")
		if len(parts) == 2 {
			return parts[1], nil
		}
	}

	// Fallback to the image ID if RepoDigests is not available (this can happen for locally built images)
	if inspect.ID != "" {
		return inspect.ID, nil
	}

	return "", fmt.Errorf("no digest found for image %s", imageName)
}

func (w *Worker) Shutdown() {
	log.Infof(w.ctx, "Shutting down worker...")

	w.tasksMutex.Lock()
	activeTaskCount := len(w.activeTasks)
	if activeTaskCount > 0 {
		log.Infof(w.ctx, "Cancelling %d active tasks", activeTaskCount)
		for taskID, cancel := range w.activeTasks {
			log.Debugf(w.ctx, "Cancelling task: %s", taskID)
			cancel()
		}
	}
	w.tasksMutex.Unlock()

	if activeTaskCount > 0 {
		time.Sleep(500 * time.Millisecond)
	}

	w.cancel()

	if w.dockerClient != nil {
		if err := w.dockerClient.Close(); err != nil {
			log.Warnf(w.ctx, "Failed to close Docker client: %v", err)
		}
	}

	w.connMutex.Lock()
	if w.conn != nil {
		if err := w.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "")); err != nil {
			log.Warnf(w.ctx, "Failed to send close message: %v", err)
		}
		if err := w.conn.Close(); err != nil {
			log.Warnf(w.ctx, "Failed to close connection: %v", err)
		}
		w.conn = nil
	}
	w.connMutex.Unlock()

	log.Infof(w.ctx, "Worker shutdown complete")
}
