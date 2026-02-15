# Compound PM System

This repo currently contains two things:

1. A vendored, self-hosted Oz stack (workspace UI + agent API + worker execution) under `vendor/oz/`.
2. Design/spec documents for a “Compound PM System” workflow under `DESIGN.md` and `docs/`.

If you are looking for the working software, start with the Oz stack docs: `docs/OZ_STACK.md`.

## Security

See `SECURITY.md` for operational security notes (secrets at rest, privileged worker/Docker model, agent internal API keys).

## What’s Implemented (Oz Stack)

- `vendor/oz/oz-workspace`: Next.js workspace UI (rooms, agents, tasks, SSE updates)
- `vendor/oz/oz-control-plane`: Oz-compatible `/api/v1` control plane (Option 2)
- `vendor/oz/oz-agent-worker`: self-hosted Go worker that executes runs in Docker via WebSocket
- `vendor/oz/oz-agent-sidecar`: minimal sidecar image (`/agent/entrypoint.sh`) that runs `claude`/`codex`/`gemini` CLIs inside task containers
- Multi-provider routing + rolling-window quotas + ordered fallback + optional queue-on-saturation
- Run state tracking + SDK-compatible run list/retrieve/cancel APIs
- Environments API (`/api/v1/environments/*`) to map `environment_id` -> docker image + repos + setup + env vars
- Artifact extraction (best-effort PR URL detection) through worker completion messages

## Docs

- Oz stack: `docs/OZ_STACK.md`
- Repo architecture (current): `docs/ARCHITECTURE.md`
- Rate limits (spec + implementation mapping): `docs/RATE-LIMIT-SYSTEM.md`
- Compound PM workflow specs (design-stage): `DESIGN.md`, `docs/AGENTS.md`, `docs/AGENT-DRIVEN-RELEASES.md`, `docs/KIMI-SELF-EVOLUTION.md`
