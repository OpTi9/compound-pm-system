# Oz Agent Sidecar (De-Warp)

This Docker image is used by `oz-agent-worker` as the `sidecar_image`.

The worker extracts the sidecar filesystem and mounts it into each task container at `/agent`,
then runs:

```sh
/bin/sh /agent/entrypoint.sh agent run ...
```

This sidecar implements a minimal, non-proprietary `entrypoint.sh` that executes `OZ_TASK_PROMPT`
using CLIs present in the task container image (e.g. `claude`, `codex`, `gemini`).

In worker mode, the control plane can also pass environment setup via:

- `OZ_ENV_REPOS` (newline-separated repo specs; `owner/repo` defaults to GitHub HTTPS)
- `OZ_ENV_SETUP_COMMANDS` (newline-separated shell commands run under `/bin/sh -lc`)
- `OZ_ENV_VARS` (newline-separated `KEY=VALUE`, exported before invoking the CLI)

The sidecar writes:

- `/workspace/.oz/agent_output.txt` (CLI stdout/stderr)
- `/workspace/.oz/result.json` (minimal metadata)

## Build

```sh
cd vendor/oz/oz-agent-sidecar
docker build -t oz-agent-sidecar:dev .
```

Then configure the control plane:

- `OZ_WORKER_SIDECAR_IMAGE=oz-agent-sidecar:dev`
