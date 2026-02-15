# Repository Architecture (Current)

This repo is primarily a vendored, self-hosted Oz stack plus a set of “Compound PM System” design/spec documents.

## Vendored Oz Stack

Location: `vendor/oz/`

- `vendor/oz/oz-workspace`
  - Next.js workspace UI + SSE broadcasting
  - Can run agents in-process (`OZ_RUNNER_MODE=local`) or via a remote Oz API (`OZ_RUNNER_MODE=remote`)
  - Exposes SDK-compatible API routes at `app/api/v1/*` when running locally
- `vendor/oz/oz-control-plane`
  - Standalone Oz-compatible `/api/v1` control plane (Option 2)
  - Owns: run state, provider routing/quota tracking, environment registry, worker WebSocket
- `vendor/oz/oz-agent-worker`
  - Self-hosted worker that connects to the control plane WebSocket and executes `PENDING` runs inside Docker
- `vendor/oz/oz-agent-sidecar`
  - Minimal sidecar filesystem mounted at `/agent` inside task containers
  - Runs third-party CLIs (`claude`, `codex`, `gemini`) inside the task image using `OZ_TASK_PROMPT`
- `vendor/oz/oz-sdk-typescript`, `vendor/oz/oz-sdk-python`
  - SDKs can talk to either `oz-control-plane` or `oz-workspace` (local `/api/v1`)

## Execution Paths

1. Local runner:
   - Workspace -> provider router -> provider HTTP/CLI
2. Remote API:
   - Workspace/SDK -> control plane -> provider router -> provider HTTP/CLI
3. Remote worker:
   - Workspace/SDK -> control plane -> worker WS -> worker -> Docker + sidecar -> CLI

See `docs/OZ_STACK.md` for config and operations.

## Compound PM Docs (Design Stage)

These documents describe the intended “Compound PM System” workflow. They are not a complete, runnable command framework in this repo yet.

- `DESIGN.md`
- `docs/AGENTS.md`
- `docs/AGENT-DRIVEN-RELEASES.md`
- `docs/KIMI-SELF-EVOLUTION.md`
- `docs/RATE-LIMIT-SYSTEM.md` (includes implementation mapping to Oz router)

