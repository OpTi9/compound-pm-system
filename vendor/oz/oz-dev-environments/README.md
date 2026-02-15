# Oz Dev Environments (Images)

This module provides a configurable `Dockerfile` for building task images used by worker-mode Oz runs.

An environment (as created via `oz-control-plane` `/api/v1/environments`) defines:

- `docker_image` (the task image)
- `repos` to clone into `/workspace`
- `setup_commands` to run before executing the harness CLI
- `env_vars` exported before invoking the harness CLI (e.g. `ANTHROPIC_API_KEY`)

## Build Images

The `Dockerfile` is parameterized via build args so you can publish your own images (to Docker Hub, GHCR, etc.).

### Base image (Node + Python + git)

```bash
docker build -t oz-dev-base:latest .
```

### Base + coding agent CLIs (claude/codex/gemini + gh)

```bash
docker build -t oz-dev-base:latest-agents . \
  --build-arg INSTALL_CODING_AGENTS=true
```

### Go image (+ agents)

```bash
docker build -t oz-dev-go:1.23-agents . \
  --build-arg INSTALL_GO=true \
  --build-arg INSTALL_CODING_AGENTS=true \
  --build-arg LANGUAGES=go
```

## Use With The Control Plane

Create an environment object pointing at your published image:

```bash
curl -sS -X POST http://localhost:8080/api/v1/environments \
  -H "Authorization: Bearer $OZ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-project",
    "docker_image": "oz-dev-base:latest-agents",
    "repos": ["owner/repo"],
    "setup_commands": ["npm install"],
    "env_vars": {
      "ANTHROPIC_API_KEY": "..."
    }
  }'
```

Then run an agent with `config.environment_id` set to the returned `environment_id` to force worker execution.

