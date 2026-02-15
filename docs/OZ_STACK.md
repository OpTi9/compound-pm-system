# Self-Hosted Oz Stack

This repo vendors a complete, self-hostable Oz stack under `vendor/oz/` with no Warp infrastructure dependencies.

## Components

- `vendor/oz/oz-workspace` (port 3000): UI (rooms, agents, tasks, SSE updates)
- `vendor/oz/oz-control-plane` (port 8080): Oz-compatible `/api/v1` API (runs, routing, environments, worker WS)
- `vendor/oz/oz-agent-worker`: Go worker that claims `PENDING` runs and executes them in Docker
- `vendor/oz/oz-agent-sidecar`: sidecar filesystem mounted at `/agent` inside task containers, providing `/agent/entrypoint.sh`

## Execution Modes

### 1. Local Runner (Workspace Only)

Path: `oz-workspace` -> provider HTTP/CLI

- Set `OZ_RUNNER_MODE=local` in `vendor/oz/oz-workspace/.env.local`.
- Configure one or more providers with `OZ_PROVIDER_*` env vars (see below).

### 2. Remote API (Control Plane Only)

Path: `oz-workspace` or SDK -> `oz-control-plane` -> provider HTTP/CLI

- Set `OZ_RUNNER_MODE=remote` and `OZ_API_BASE_URL=http://localhost:8080/api/v1` in workspace.
- Control plane runs the provider router and persists run state.

### 3. Remote Worker (Docker)

Path: `oz-workspace` or SDK -> `oz-control-plane` -> WebSocket -> `oz-agent-worker` -> Docker task container + sidecar

- Create an environment object and pass its `environment_id` in `config.environment_id`.
- Runs with `environment_id` are created as `PENDING` and assigned to workers.

## Auth / Multi-Tenant

Control plane requires `Authorization: Bearer <token>` on every `/api/v1/*` request.

- If bearer equals `OZ_ADMIN_API_KEY`: admin scope (can see all runs, can connect worker WS).
- Otherwise: runs and environments are scoped to that token (tenant key = `sha256(token)`).

## Providers (Routing + Quotas + Fallback)

Providers are configured by environment variables. A “provider key” is an identifier like `glm`, `kimi`, `claude`, `codex`, `custom`.

Common env vars:

- `OZ_PROVIDER_<KEY>_TYPE`: `openai_compatible` | `anthropic` | `cli`
- `OZ_PROVIDER_<KEY>_MODEL`
- `OZ_PROVIDER_<KEY>_BASE_URL` (required for `openai_compatible`)
- `OZ_PROVIDER_<KEY>_API_KEY` (provider API key; optional for local CLIs)
- `OZ_PROVIDER_<KEY>_MSG_LIMIT` + `OZ_PROVIDER_<KEY>_WINDOW_SECONDS` (rolling-window quota by “messages”)
- `OZ_PROVIDER_FALLBACK_ORDER` (comma-separated provider keys)
- `OZ_QUEUE_ON_SATURATION=true|false`
- `OZ_QUEUE_MAX_WAIT_SECONDS` (default: 300)

Harness-to-provider defaults (if configured):

- `claude-code` -> provider key `claude` (default type `anthropic`, can be `cli`)
- `codex` -> `codex` (default type `openai_compatible`, can be `cli`)
- `glm` -> `glm` (`openai_compatible`)
- `kimi` -> `kimi` (`openai_compatible`)
- `custom` -> `custom` (`openai_compatible`)

## Environments API

The control plane provides an environment registry so `environment_id` is a first-class object (not just a Docker image string).

Endpoints:

- `POST /api/v1/environments`
- `GET /api/v1/environments`
- `GET /api/v1/environments/:id`

Create example:

```bash
curl -sS -X POST http://localhost:8080/api/v1/environments \
  -H "Authorization: Bearer $OZ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "compound-pm",
    "docker_image": "ubuntu:22.04",
    "repos": ["OpTi9/compound-pm-system"],
    "setup_commands": ["npm install"],
    "env_vars": {
      "ANTHROPIC_API_KEY": "..."
    }
  }'
```

Worker-mode assignment passes the environment into the task container via:

- `OZ_ENV_REPOS` (newline-separated)
- `OZ_ENV_SETUP_COMMANDS` (newline-separated)
- `OZ_ENV_VARS` (newline-separated `KEY=VALUE`)

The sidecar applies them before running the harness CLI.

## Artifacts

In worker mode, the sidecar writes `/workspace/.oz/agent_output.txt`. The worker copies it out and:

- uses it as the run `output` (preferred over Docker log stream)
- extracts best-effort artifacts:
  - GitHub PR URLs are returned as `PULL_REQUEST` artifacts in `artifacts`

`GET /api/v1/agent/runs/:id` and `GET /api/v1/agent/runs` return `artifacts` and `session_link` fields.
