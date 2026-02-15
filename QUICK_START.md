# Quick Start (Oz Stack)

Fastest path to a working app is **Mode 1: workspace local runner**. Use the other modes only if you need a centralized API and/or Docker execution.

References:
- Full stack reference: `docs/OZ_STACK.md`
- Longer setup guide: `GETTING_STARTED.md`

## Prereqs

- Node.js 20+
- Docker (only for worker mode)

## Mode 1: Workspace Only (Local Runner)

```bash
cd vendor/oz/oz-workspace
npm install
cp .env.example .env.local
```

Set at least these in `vendor/oz/oz-workspace/.env.local`:

```bash
TURSO_DATABASE_URL="file:./prisma/dev.db"
DATABASE_URL="file:./prisma/dev.db"

AUTH_SECRET="..."     # openssl rand -base64 32
AGENT_API_KEY="..."   # openssl rand -base64 32

OZ_RUNNER_MODE=local

# Pick one provider (examples; see .env.example for full routing/quota config)
OZ_PROVIDER_CLAUDE_TYPE=anthropic
OZ_PROVIDER_CLAUDE_API_KEY="..."
OZ_PROVIDER_CLAUDE_MODEL="claude-3-5-sonnet-latest"
```

Initialize DB + run:

```bash
npx prisma generate
npx prisma db push
npm run dev
```

Open `http://localhost:3000`.

## Mode 2: Workspace + Control Plane (Remote API)

Start control plane:

```bash
cd vendor/oz/oz-control-plane
npm install
cp .env.example .env
npm run prisma:migrate
npm run dev
```

Point workspace at it (edit `vendor/oz/oz-workspace/.env.local`):

```bash
OZ_RUNNER_MODE=remote
OZ_API_BASE_URL="http://localhost:8080/api/v1"
OZ_API_KEY="any-bearer-token"
```

## Mode 3: Control Plane + Worker (Docker Execution)

Build sidecar:

```bash
cd vendor/oz/oz-agent-sidecar
docker build -t oz-agent-sidecar:dev .
```

Ensure control plane `.env` has:

```bash
OZ_ADMIN_API_KEY="change-me"
OZ_WORKER_SIDECAR_IMAGE="oz-agent-sidecar:dev"
```

Start worker:

```bash
cd vendor/oz/oz-agent-worker
go build -o oz-agent-worker
OZ_API_KEY="$OZ_ADMIN_API_KEY" ./oz-agent-worker --worker-id "worker-1"
```

Create an environment via `POST /api/v1/environments`, then set agents to use that `environment_id` (or set `OZ_ENVIRONMENT_ID` in workspace).

## Notes

- Workspace internal agent endpoints (including `POST /api/agent-response`) require `X-Agent-Key: $AGENT_API_KEY`.
- If you host the workspace and control plane on different origins, set `OZ_CORS_ORIGIN` on the control plane.
- For durability-sensitive SSE updates, you can set `OZ_REDIS_EVENTS_DURABLE=1` on the workspace.

## Run Tests

```bash
cd vendor/oz/oz-workspace
npm test
```

