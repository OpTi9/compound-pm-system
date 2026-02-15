# Oz Control Plane (Option 2)

Standalone control plane service that implements an Oz-compatible `/api/v1` for:

- `POST /api/v1/agent/run`
- `GET /api/v1/agent/runs`
- `GET /api/v1/agent/runs/:runID`
- `POST /api/v1/agent/runs/:runID/cancel`
- `POST /api/v1/environments`
- `GET /api/v1/environments`
- `GET /api/v1/environments/:id`

It runs agent tasks locally using the same provider routing contract as `oz-workspace`
(`OZ_PROVIDER_*`, fallback, quotas, queueing).

## Self-Hosted Worker (oz-agent-worker)

This control plane exposes a WebSocket compatible with `oz-agent-worker` at:

- `ws://localhost:8080/api/v1/selfhosted/worker/ws?worker_id=...`

When `config.environment_id` is provided to `POST /api/v1/agent/run`, the run is created in
state `PENDING` and will be assigned to connected workers instead of running in-process.

You must set:

- `OZ_WORKER_SIDECAR_IMAGE` (see `vendor/oz/oz-agent-sidecar`)

## Environments

When `config.environment_id` is provided to `POST /api/v1/agent/run`, the run is created in
state `PENDING` and will be assigned to connected workers.

`environment_id` is intended to be an environment object ID created via `/api/v1/environments`
which maps to:

- `docker_image`
- `repos` (cloned by the sidecar)
- `setup_commands` (run by the sidecar)
- `env_vars` (exported by the sidecar before invoking the harness CLI)

Back-compat: if an environment record is not found, the worker assignment treats
`environment_id` as a raw Docker image string.

## Artifacts

Worker completions can include:

- `output` (stored on the run)
- `artifacts` (stored and returned from `/api/v1/agent/runs*`)
- `session_link` (optional)

In the vendored worker/sidecar path, the sidecar writes `/workspace/.oz/agent_output.txt` and
the worker extracts best-effort artifacts (currently GitHub PR URLs).

## Auth Model

Every request must include `Authorization: Bearer <token>`.

- If `OZ_ADMIN_API_KEY` is set and the bearer matches it: admin scope (can see all runs).
- Otherwise: the bearer token scopes runs (tenant isolation is `sha256(token)`).

This is intended for localhost/private-network usage.

## Run Locally

1. `cd vendor/oz/oz-control-plane`
2. Create `.env` from `.env.example` and set at least one provider (`OZ_PROVIDER_*`).
3. Apply migrations:
   - `npm run prisma:migrate`
4. Start:
   - `npm run dev`

Default base URL: `http://localhost:8080/api/v1`
