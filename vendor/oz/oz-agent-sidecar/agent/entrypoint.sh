#!/usr/bin/env sh
set -eu

# Expected invocation from oz-agent-worker:
#   /bin/sh /agent/entrypoint.sh agent run --task-id <id> --server-root-url <root> --model <model> ...
#
# This sidecar is intentionally minimal and de-coupled from any proprietary agent CLI.
# It executes a prompt (from OZ_TASK_PROMPT) using a third-party CLI present in the *task*
# container image (e.g. claude/codex/gemini).

if [ "${1-}" = "agent" ]; then
  shift
fi

subcmd="${1-}"
if [ "$subcmd" = "run" ]; then
  shift
fi

model=""
while [ $# -gt 0 ]; do
  case "$1" in
    --model)
      model="${2-}"
      shift 2
      ;;
    --task-id|--server-root-url|--share|--sandboxed|--idle-on-complete|--environment|--profile|--skill|--mcp|--computer-use|--no-computer-use)
      # ignore + consume arg if it has a value
      case "$1" in
        --task-id|--server-root-url|--environment|--profile|--skill|--mcp)
          shift 2
          ;;
        *)
          shift 1
          ;;
      esac
      ;;
    *)
      shift 1
      ;;
  esac
done

prompt="${OZ_TASK_PROMPT-}"
if [ -z "$prompt" ]; then
  echo "OZ_TASK_PROMPT is not set" >&2
  exit 2
fi

norm="$(printf "%s" "$model" | tr '[:upper:]' '[:lower:]')"

run_cmd() {
  cmd="$1"
  shift
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required CLI not found in task image: $cmd" >&2
    exit 127
  fi
  "$cmd" "$@"
}

case "$norm" in
  *claude*|claude-code)
    claude_cmd="${OZ_SIDECAR_CLAUDE_CMD-claude}"
    # Claude Code: `claude -p "<prompt>"`
    run_cmd "$claude_cmd" -p "$prompt"
    ;;
  *codex*|codex)
    codex_cmd="${OZ_SIDECAR_CODEX_CMD-codex}"
    # Codex CLI: `codex exec "<prompt>"`
    run_cmd "$codex_cmd" exec "$prompt"
    ;;
  *gemini*|gemini-cli)
    gemini_cmd="${OZ_SIDECAR_GEMINI_CMD-gemini}"
    # Gemini CLI: `gemini -p "<prompt>"`
    run_cmd "$gemini_cmd" -p "$prompt"
    ;;
  *)
    echo "Unsupported model/harness for sidecar: ${model:-<empty>}" >&2
    exit 2
    ;;
esac

