#!/usr/bin/env bash
set -euo pipefail

# Seeds labels used by the Compound PM spec into the current GitHub repo.
#
# Usage:
#   gh auth status
#   scripts/github/seed-labels.sh

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 2
  }
}

require gh

labels=(
  "version:major|Breaking changes|B60205"
  "version:minor|New features|0E8A16"
  "version:patch|Bug fixes|1D76DB"
  "version:rc|Release candidate|5319E7"
  "oz-agent|Trigger Oz agent automation|5319E7"
  "status:backlog|Not started|D4C5F9"
  "status:analysis|In analysis|FBCA04"
  "status:planning|In planning|FBCA04"
  "status:ready|Ready for implementation|0E8A16"
  "status:in-progress|Implementation in progress|0052CC"
  "status:blocked|Blocked|B60205"
  "status:review|In review|5319E7"
)

for entry in "${labels[@]}"; do
  IFS="|" read -r name desc color <<< "$entry"
  if gh label list --search "$name" --json name --jq '.[].name' | grep -qx "$name"; then
    continue
  fi
  gh label create "$name" --description "$desc" --color "$color" || true
done

echo "Done."
