# GitHub Workflows (PM-Driven)

This repo includes a minimal GitHub-first workflow that lets you (PM) create issues and delegate work to agents.

## What’s Included

- Issue templates: `.github/ISSUE_TEMPLATE/*`
- Label seeding script: `scripts/github/seed-labels.sh`
- Workflows:
  - `.github/workflows/oz-plan-release.yml`: runs the Avery+Rex planning loop on issues with a `version:*` label.
  - `.github/workflows/oz-execute-ready.yml`: when you apply `status:ready`, fans out Avery’s tasks into parallel task PRs against a `beta/issue-N` base branch.
  - `.github/workflows/oz-auto-fix-issue.yml`: runs an “implement and PR” agent when you apply the `oz-agent` label.
- A lightweight composite action: `.github/actions/oz-agent-run` (wraps the `oz` CLI).

## Requirements

1. An Oz API reachable from your GitHub runner (self-hosted runner is typical for localhost/private Oz).
2. The `oz` CLI installed on the runner, or a hosted `.deb` URL to install it.

## Required Secrets / Vars

- Repo secrets:
  - `OZ_API_KEY`: bearer token for Oz (`OZ_API_KEY` for the CLI).
  - `OZ_API_BASE_URL` (recommended): e.g. `https://oz.example.com/api/v1` (exported as `OZ_API_BASE_URL`).
  - `OZ_CLI_DEB_URL` (optional): URL to an `oz` CLI `.deb` (used if the runner does not already have `oz`).
- Repo variables (optional):
  - `OZ_CLI_PATH`: default `oz`
  - `OZ_AGENT_PROFILE`: if unset, the workflows use `--sandboxed`
  - `OZ_MODEL_AVERY`: model id for the planning run
  - `OZ_MODEL_REX`: model id for the review run

## Bootstrap Labels

The templates and workflows assume some labels exist.

```bash
scripts/github/seed-labels.sh
```

## Usage

1. Create an issue using one of:
   - “Release Request (Major)”
   - “Release Request (Minor)”
   - “Release Request (Patch)”
2. The `oz-plan-release` workflow will comment an Avery plan plus Rex review once a `version:*` label exists.
3. If the plan is good, apply `status:ready` to the issue to fan out task PRs against a `beta/issue-N` base branch.
4. When you want a single-shot agent to attempt an implementation PR, apply the `oz-agent` label to an issue.
