# Getting Started

This repo vendors a self-hosted Oz stack under `vendor/oz/`. You can run it in three modes:

1. Workspace-only, local runner (fastest): `oz-workspace` runs providers directly.
2. Workspace + control plane, API-only: `oz-workspace` calls `oz-control-plane`, which runs providers directly.
3. Workspace + control plane + worker: `oz-control-plane` dispatches to `oz-agent-worker` which runs tasks in Docker using `oz-agent-sidecar`.

See `docs/OZ_STACK.md` for the full reference.

## Prerequisites

- Node.js 20+ (workspace + control plane)
- Docker (only needed for worker mode)
- One or more providers configured (OpenAI-compatible API, Anthropic API, or CLI-based subscriptions)

## Mode 1: Workspace (Local Runner)

1. `cd vendor/oz/oz-workspace`
2. `cp .env.example .env.local`
3. Set at least:
   - `AUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `AGENT_API_KEY` (internal key for agent endpoints like `/api/agent-response`)
   - `OZ_RUNNER_MODE=local`
   - A provider (examples are in `.env.example`)
4. Install + run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Mode 2: Workspace + Control Plane (API-Only)

1. Start the control plane:

```bash
cd vendor/oz/oz-control-plane
cp .env.example .env
npm install
npm run prisma:migrate
npm run dev
```

2. Point the workspace at it:
   - `OZ_RUNNER_MODE=remote`
   - `OZ_API_BASE_URL=http://localhost:8080/api/v1`
   - `OZ_API_KEY=<any bearer token>`

Note: `oz-control-plane` scopes runs by bearer token (tenant isolation is `sha256(token)`), unless the token equals `OZ_ADMIN_API_KEY`.

Optional:
- `OZ_CORS_ORIGIN` on `oz-control-plane` if your workspace is hosted on a different origin.

## Mode 3: Worker Execution (Docker Isolation)

1. Build the sidecar image:

```bash
cd vendor/oz/oz-agent-sidecar
docker build -t oz-agent-sidecar:dev .
```

2. Ensure control plane has:
   - `OZ_WORKER_SIDECAR_IMAGE=oz-agent-sidecar:dev`
   - `OZ_ADMIN_API_KEY` set (worker WebSocket requires admin auth)

3. Start the worker (in another terminal):

```bash
cd vendor/oz/oz-agent-worker
go build -o oz-agent-worker
OZ_API_KEY="$OZ_ADMIN_API_KEY" ./oz-agent-worker --worker-id "worker-1"
```

4. Create an environment via the control plane (`/api/v1/environments`) and pass its `environment_id` in `config.environment_id` when starting a run (workspace does this when an agent/environment is set).

Optional worker resiliency:
- `OZ_RECONNECT_MAX_ATTEMPTS` (default `0` = unlimited)
- `OZ_RECONNECT_WINDOW_SECONDS` (default `0` = no windowing)
