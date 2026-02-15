# Oz Agent Sidecar (De-Warp)

This Docker image is used by `oz-agent-worker` as the `sidecar_image`.

The worker extracts the sidecar filesystem and mounts it into each task container at `/agent`,
then runs:

```sh
/bin/sh /agent/entrypoint.sh agent run ...
```

This sidecar implements a minimal, non-proprietary `entrypoint.sh` that executes `OZ_TASK_PROMPT`
using CLIs present in the task container image (e.g. `claude`, `codex`, `gemini`).

## Build

```sh
cd vendor/oz/oz-agent-sidecar
docker build -t oz-agent-sidecar:dev .
```

Then configure the control plane:

- `OZ_WORKER_SIDECAR_IMAGE=oz-agent-sidecar:dev`

