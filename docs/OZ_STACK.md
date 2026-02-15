# Self-Hosted Oz Stack

This repo vendors a complete, self-hostable Oz stack under `vendor/oz/` with no Warp infrastructure dependencies.

## Components

- `vendor/oz/oz-workspace` (port 3000): UI (rooms, agents, tasks, SSE updates)
- `vendor/oz/oz-control-plane` (port 8080): Oz-compatible `/api/v1` API (runs, routing, environments, worker WS)
- `vendor/oz/oz-agent-worker`: Go worker that claims `PENDING` runs and executes them in Docker
- `vendor/oz/oz-agent-sidecar`: sidecar filesystem mounted at `/agent` inside task containers, providing `/agent/entrypoint.sh`

## Workspace Internal Auth (Agent Key)

The workspace has internal endpoints that must not be reachable by untrusted clients.

- Set `AGENT_API_KEY` in `vendor/oz/oz-workspace/.env.local`
- Internal callers must send: `X-Agent-Key: $AGENT_API_KEY`
- The workspace enforces this on `POST /api/agent-response` (agent callback ingestion) and other internal `/api/agent/*` routes.

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

## SDK Compatibility Notes

- Create run: both `POST /api/v1/agent/run` (singular) and `POST /api/v1/agent/runs` (plural) are supported.
- Runs list pagination: `GET /api/v1/agent/runs?limit=N&cursor=<run_id>` returns `next_cursor` when more results exist.

## Health Check

- `GET /health` returns `200` only if the HTTP server is up and the database is reachable.

## Logging / Request IDs

- Control plane logs are JSON lines by default (suitable for container logs).
- Every HTTP response includes `X-Request-Id`. You can also pass `X-Request-Id` on requests to supply your own.
- Configure verbosity with `OZ_LOG_LEVEL=debug|info|warn|error` on the control plane.

## Operational Hardening

Control plane supports:

- Startup validation:
  - `DATABASE_URL` required
  - `OZ_ADMIN_API_KEY` required unless `OZ_ALLOW_NO_ADMIN_KEY=true`
  - Optional provider validation with `OZ_STARTUP_VALIDATE_PROVIDERS=true` (and optional `OZ_VALIDATE_HARNESSES=...`)
- Graceful shutdown on `SIGINT`/`SIGTERM` (closes worker WS, stops retention, drains HTTP server, disconnects Prisma).
  - Data retention for terminal runs:
  - `OZ_RUN_RETENTION_DAYS` (default `30`, set `<=0` to disable)
  - `OZ_RETENTION_SWEEP_INTERVAL_MS` (default `3600000`)

Additional knobs added in this repo:

- Control plane CORS (optional): `OZ_CORS_ORIGIN=https://your-workspace.example`
- Worker reconnect circuit breaker (optional):
  - `OZ_RECONNECT_MAX_ATTEMPTS` (default `0` = unlimited)
  - `OZ_RECONNECT_WINDOW_SECONDS` (default `0` = no windowing)
- Workspace SSE event durability (optional): `OZ_REDIS_EVENTS_DURABLE=1`
  - When enabled, key write routes await Redis `XADD` instead of fire-and-forget (still best-effort).
- Workspace stale agent sweeper (optional): `OZ_STALE_AGENT_SWEEP_MS=300000`
  - Resets agents stuck in `"running"` in a room if their `updatedAt` is older than the cutoff.
