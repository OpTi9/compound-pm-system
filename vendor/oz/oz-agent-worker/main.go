package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/alecthomas/kong"
	"github.com/warpdotdev/oz-agent-worker/internal/log"
	"github.com/warpdotdev/oz-agent-worker/internal/worker"
)

var CLI struct {
	APIKey        string   `help:"API key for authentication" env:"OZ_API_KEY"`
	WorkerID      string   `help:"Worker host identifier" required:""`
	WebSocketURL  string   `default:"ws://localhost:8080/api/v1/selfhosted/worker/ws" hidden:""`
	ServerRootURL string   `default:"http://localhost:8080" hidden:""`
	LogLevel      string   `help:"Log level (debug, info, warn, error)" default:"info" enum:"debug,info,warn,error"`
	NoCleanup     bool     `help:"Do not remove containers after execution (for debugging)"`
	Volumes       []string `help:"Volume mounts for task containers (format: HOST_PATH:CONTAINER_PATH or HOST_PATH:CONTAINER_PATH:MODE)" short:"v"`
}

func main() {
	ctx := context.Background()

	kong.Parse(&CLI,
		kong.Name("oz-agent-worker"),
		kong.Description("Self-hosted worker for Oz agents."),
		kong.UsageOnError(),
		kong.Vars{},
	)

	if CLI.APIKey == "" {
		log.Fatalf(ctx, "Missing API key: set OZ_API_KEY")
	}

	log.SetLevel(CLI.LogLevel)

	config := worker.Config{
		APIKey:        CLI.APIKey,
		WorkerID:      CLI.WorkerID,
		WebSocketURL:  CLI.WebSocketURL,
		ServerRootURL: CLI.ServerRootURL,
		LogLevel:      CLI.LogLevel,
		NoCleanup:     CLI.NoCleanup,
		Volumes:       CLI.Volumes,
	}

	w, err := worker.New(ctx, config)
	if err != nil {
		log.Fatalf(ctx, "Failed to create worker: %v", err)
	}

	// Set up signal handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start worker in background
	go func() {
		if err := w.Start(); err != nil {
			log.Errorf(ctx, "Worker stopped with error: %v", err)
		}
	}()

	// Wait for signal
	sig := <-sigChan
	log.Infof(ctx, "Received signal %v, shutting down gracefully...", sig)

	w.Shutdown()

	log.Infof(ctx, "Worker shutdown complete")
}
