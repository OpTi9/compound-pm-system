# Conventions

This repo vendors a runnable Oz stack under `vendor/oz/` and treats the rest of the repo as a spec/roadmap.

## Code Layout

- `vendor/oz/oz-workspace`: Next.js UI + API routes, Prisma (SQLite/libsql), orchestrator script.
- `vendor/oz/oz-control-plane`: Control plane API + worker WS.
- `vendor/oz/oz-agent-worker`: Go worker that executes runs via Docker.

## API & Auth

- User-authenticated routes use `getAuthenticatedUserId()` and must scope by `userId` or `room.userId`.
- Agent callbacks/worker-to-workspace endpoints must require an agent key.
  - Header: `X-Agent-Key`.
  - Helper: `lib/agent-auth.ts` (`validateAgentApiKey`).

## Validation

- Normalize/validate enum-like strings at the API boundary.
  - Helpers: `vendor/oz/oz-workspace/lib/validation.ts`.

## Pagination

- Prefer cursor pagination for unbounded collections.
- Cursor format used by Oz routes: `<ISO timestamp>|<id>`.
  - `GET /api/prds`: order `updatedAt desc, id desc`.
  - `GET /api/work-items`: order `createdAt desc/asc, id desc/asc` (asc when `chainId` is set).
- When a next cursor exists, return both:
  - JSON field `nextCursor`.
  - Header `X-OZ-Next-Cursor`.

## Rate Limiting

- Reuse `vendor/oz/oz-workspace/lib/rate-limit.ts` for public/auth endpoints.

## Orchestrator Leases

- Work items use `leaseExpiresAt` + `leaseOwner` to avoid stale updates across multiple orchestrators.
- Override instance identity with `OZ_ORCH_INSTANCE_ID`.
- Claiming work should be atomic when possible (single UPDATE with conditional + RETURNING).

## Realtime Events

- `vendor/oz/oz-workspace/lib/event-broadcaster.ts` is best-effort.
  - It retries Redis `XADD` a few times, but callers should assume events can still be dropped.
  - Treat events as UI refresh hints, not a durability mechanism.

## Prisma Migrations (SQLite)

- Adding/changing FKs requires table rebuild migrations (SQLite limitation).
- If a new FK would fail due to existing bad data, explicitly repair it in the migration (e.g. NULL orphan refs).
