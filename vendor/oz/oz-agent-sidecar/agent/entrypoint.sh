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

workdir="/workspace"
oz_dir="$workdir/.oz"

apply_env_vars() {
  if [ -z "${OZ_ENV_VARS-}" ]; then
    return 0
  fi
  tmp="/tmp/oz_env_vars_$$.txt"
  printf "%s\n" "$OZ_ENV_VARS" >"$tmp"
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      *=*)
        key="${line%%=*}"
        val="${line#*=}"
        # Minimal validation to avoid exporting garbage.
        case "$key" in
          ""|[0-9]*|*[!A-Za-z0-9_]*)
            continue
            ;;
        esac
        export "$key=$val"
        ;;
    esac
  done <"$tmp"
  rm -f "$tmp"
}

clone_repos() {
  [ -z "${OZ_ENV_REPOS-}" ] && return 0
  if [ -d "$workdir/.git" ]; then
    return 0
  fi
  if ! command -v git >/dev/null 2>&1; then
    echo "git is required to clone OZ_ENV_REPOS but was not found in task image" >&2
    exit 127
  fi

  i=0
  printf "%s\n" "$OZ_ENV_REPOS" | while IFS= read -r repo; do
    repo="$(printf "%s" "$repo" | tr -d '\r')"
    [ -z "$repo" ] && continue

    url="$repo"
    case "$repo" in
      *://*|git@*|ssh://*)
        url="$repo"
        ;;
      */*)
        url="https://github.com/$repo.git"
        ;;
    esac

    base="${repo##*/}"
    base="${base%.git}"
    [ -z "$base" ] && base="repo"

    dest="$workdir/$base"
    if [ "$i" -eq 0 ]; then
      # Prefer cloning the first repo into /workspace, but only if it's truly empty.
      # git clone fails if the directory is non-empty (even if it only contains dotfiles).
      if [ -z "$(ls -A "$workdir" 2>/dev/null || true)" ]; then
        dest="$workdir"
      fi
    fi

    if [ -d "$dest/.git" ]; then
      i=$((i + 1))
      continue
    fi

    mkdir -p "$dest"
    git clone --depth=1 "$url" "$dest"
    i=$((i + 1))
  done
}

run_setup_commands() {
  [ -z "${OZ_ENV_SETUP_COMMANDS-}" ] && return 0
  printf "%s\n" "$OZ_ENV_SETUP_COMMANDS" | while IFS= read -r cmd; do
    cmd="$(printf "%s" "$cmd" | tr -d '\r')"
    [ -z "$cmd" ] && continue
    (cd "$workdir" && /bin/sh -c "$cmd")
  done
}

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
    apply_env_vars
    clone_repos
    run_setup_commands
    mkdir -p "$oz_dir"
    out="$oz_dir/agent_output.txt"
    result="$oz_dir/result.json"
    set +e
    run_cmd "$claude_cmd" -p "$prompt" >"$out" 2>&1
    code=$?
    set -e
    cat "$out"
    printf '{\"exit_code\":%s,\"output_path\":\"%s\"}\n' "$code" "$out" >"$result" 2>/dev/null || true
    exit "$code"
    ;;
  *codex*|codex)
    codex_cmd="${OZ_SIDECAR_CODEX_CMD-codex}"
    # Codex CLI: `codex exec "<prompt>"`
    apply_env_vars
    clone_repos
    run_setup_commands
    mkdir -p "$oz_dir"
    out="$oz_dir/agent_output.txt"
    result="$oz_dir/result.json"
    set +e
    run_cmd "$codex_cmd" exec "$prompt" >"$out" 2>&1
    code=$?
    set -e
    cat "$out"
    printf '{\"exit_code\":%s,\"output_path\":\"%s\"}\n' "$code" "$out" >"$result" 2>/dev/null || true
    exit "$code"
    ;;
  *gemini*|gemini-cli)
    gemini_cmd="${OZ_SIDECAR_GEMINI_CMD-gemini}"
    # Gemini CLI: `gemini -p "<prompt>"`
    apply_env_vars
    clone_repos
    run_setup_commands
    mkdir -p "$oz_dir"
    out="$oz_dir/agent_output.txt"
    result="$oz_dir/result.json"
    set +e
    run_cmd "$gemini_cmd" -p "$prompt" >"$out" 2>&1
    code=$?
    set -e
    cat "$out"
    printf '{\"exit_code\":%s,\"output_path\":\"%s\"}\n' "$code" "$out" >"$result" 2>/dev/null || true
    exit "$code"
    ;;
  *)
    echo "Unsupported model/harness for sidecar: ${model:-<empty>}" >&2
    exit 2
    ;;
esac
