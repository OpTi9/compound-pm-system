# Security Notes

This repository vendors a self-hosted Oz-style agent platform under `vendor/oz/`.

## Threat Model

- The workspace and control plane are intended to run on infrastructure you control.
- The worker (`oz-agent-worker`) is *privileged infrastructure* when it has access to the Docker daemon.

## Secrets At Rest

- User/provider keys stored in the workspace DB are stored as plaintext `Setting.value` in SQLite.
  - Files: `vendor/oz/oz-workspace/prisma/schema.prisma` (`Setting`)
  - Risk: if an attacker can read the DB file, they can read these secrets.
  - Mitigation: filesystem-level protections; consider encrypting `Setting.value` if DB backups are handled separately.

## Agent Internal API Key

- `AGENT_API_KEY` authorizes internal agent automation endpoints and agent callbacks into the workspace.
  - File: `vendor/oz/oz-workspace/lib/agent-auth.ts`
  - Treat it like an admin credential. Do not expose it to untrusted clients or browsers.
  - Header: `X-Agent-Key: $AGENT_API_KEY`
  - Enforced on: `POST /api/agent-response` (and other internal `/api/agent/*` routes).

## Worker / Docker

- The worker needs to create containers. Mounting `/var/run/docker.sock` gives the worker broad control over the host.
  - File: `vendor/oz/oz-agent-worker/README.md`
  - Run workers only on trusted hosts; use least-privilege Docker setups where possible.

## Cancellation Semantics

- Local cancellations are best-effort. Cancelling a run updates DB state, but cannot always preempt an in-flight HTTP/CLI provider call.
