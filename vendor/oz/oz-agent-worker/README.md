# oz-agent-worker

Self-hosted worker for Oz cloud agents.

## Overview

`oz-agent-worker` is a daemon that connects to Oz via WebSocket to receive and execute cloud agent tasks on self-hosted infrastructure.

## Requirements

- Docker daemon (accessible via socket or TCP)
- `OZ_API_KEY` set to the control plane admin key (`OZ_ADMIN_API_KEY`), since the worker WebSocket requires admin auth
- Network access to your control plane (defaults to `ws://localhost:8080`)

## Usage

### Docker (Recommended)

The worker needs access to the Docker daemon to spawn task containers. Mount the host's Docker socket into the container:

```bash
docker run -v /var/run/docker.sock:/var/run/docker.sock \
  -e OZ_API_KEY="change-me" \
  -e OZ_WS_URL="ws://localhost:8080/api/v1/selfhosted/worker/ws" \
  -e OZ_SERVER_ROOT_URL="http://localhost:8080" \
  oz-agent-worker:dev --worker-id "my-worker"
```

> **Note:** Mounting the Docker socket gives the container access to the host's Docker daemon. This is required for the worker to create and manage task containers.

### Build from Source

```bash
cd vendor/oz/oz-agent-worker
go build -o oz-agent-worker
OZ_API_KEY="change-me" ./oz-agent-worker --worker-id "my-worker"
```

### Config

- `OZ_WS_URL` (default: `ws://localhost:8080/api/v1/selfhosted/worker/ws`)
- `OZ_SERVER_ROOT_URL` (default: `http://localhost:8080`)

## Docker Connectivity

The worker automatically discovers the Docker daemon using standard Docker client mechanisms, in this order:

1. **`DOCKER_HOST`** environment variable (e.g., `unix:///var/run/docker.sock`, `tcp://localhost:2375`)
2. **Default socket location** (`/var/run/docker.sock` on Linux, `~/.docker/run/docker.sock` for rootless)
3. **Docker context** via `DOCKER_CONTEXT` environment variable
4. **Config file** (`~/.docker/config.json`) for context settings

Additional supported environment variables:
- `DOCKER_API_VERSION` - Specify Docker API version
- `DOCKER_CERT_PATH` - Path to TLS certificates
- `DOCKER_TLS_VERIFY` - Enable TLS verification

### Example: Remote Docker Daemon

```bash
export DOCKER_HOST="tcp://remote-host:2376"
export DOCKER_TLS_VERIFY=1
export DOCKER_CERT_PATH="/path/to/certs"
oz-agent-worker --api-key "wk-abc123" --worker-id "my-worker"
```

## License

Copyright © 2026
