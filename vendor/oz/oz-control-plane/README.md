# Oz Control Plane (Option 2)

Standalone control plane service that implements an Oz-compatible `/api/v1` for:

- `POST /api/v1/agent/run`
- `GET /api/v1/agent/runs`
- `GET /api/v1/agent/runs/:runID`
- `POST /api/v1/agent/runs/:runID/cancel`

It runs agent tasks locally using the same provider routing contract as `oz-workspace`
(`OZ_PROVIDER_*`, fallback, quotas, queueing).

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

