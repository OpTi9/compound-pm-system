# Oz CLI - Create Environment

Guide agent to create Warp Environments using `oz environment create`.

## Overview

Oz Environment = configured development environment with 3 phases:
1. **Base Environment Setup**: System packages, runtimes, core dependencies (reusable foundation)
2. **Code Fetching**: Clone repository with specific code
3. **Workspace Setup**: Project-specific setup commands (install deps, builds, migrations)

## Pre-Execution

**MANDATORY**: Create task list with exactly 3 steps:
1. Verify included repos
2. Create or select docker image
3. Determine setup commands

Track progress, mark complete.

## Phase 1: Base Environment Setup

### 1. Repository Detection

Determine which repositories to work with. Formats:
- GitHub URL: `https://github.com/owner/repo`, `https://github.com/owner/repo.git`, `git@github.com:owner/repo.git`
- owner/repo string
- Local filepath → run `git -C <path> remote get-url origin` to determine owner/repo
- Current working directory → run `git remote get-url origin`

**If repo not available locally:**
- Clone to temporary dir (e.g. `/tmp/warp-env-<random>`)
- Perform minimal/partial clone for dependency/Docker files only
- No full history, tags, or large blobs
- Only need working tree to read build/dependency files

**HARD REQUIREMENT:**
- Treat temp directory as internal-only
- **NEVER** `cd` into it or change user's working directory
- Always reference via absolute paths: `cat /tmp/warp-env-123/requirements.txt`

### 2. Docker Image Selection

Analyze repo contents to detect language/tooling:
- Dockerfile or devcontainer.json
- Dependency files: requirements.txt, poetry.lock, pipenv, package.json, yarn.lock, pnpm-lock.yaml, go.mod, Cargo.toml, etc.

### 3. Propose Base Image or Custom Image

Determine languages/frameworks across all repos.

**Warp pre-built images** (all on ubuntu with Node.js + Python):
- `warpdotdev/dev-base:latest` - Node.js + Python only
- `warpdotdev/dev-dotnet:8.0` - .NET + Node.js + Python
- `warpdotdev/dev-go:1.23` - Go + Node.js + Python
- `warpdotdev/dev-java:21` - Java + Node.js + Python
- `warpdotdev/dev-ruby:3.3` - Ruby + Node.js + Python
- `warpdotdev/dev-rust:1.85` - Rust + Node.js + Python

Each image also has an `-agents` variant (e.g. `warpdotdev/dev-rust:1.85-agents`) that includes preinstalled coding agent CLIs (Claude Code, Codex, Gemini CLI). Use the `-agents` variant when the user needs third-party coding CLIs; otherwise prefer the base tag for smaller image size.

Prefer Warp images when they match detected languages.

**Alternative approaches:**
- **Single dominant language**: Propose language-specific base (Debian/Ubuntu-based). Choose version based on repo contents.
- **Mixed-language/uncertain**: Strongly recommend custom image instead.

**Recommendation format:**
Explicitly state single clear language vs mixed/uncertain stack.

**MANDATORY STOP POINT:**
Present: "I recommend the following base image/custom image approach: [RECOMMENDATION]. This should provide [BRIEF_REASONING]. Does this work for your needs, or do you want to choose a different base image or define a custom image?"

**DO NOT CONTINUE** until user responds.

### 4. Custom Image Creation (if needed)

Only if user confirms custom image needed:

a) Verify Docker Desktop installed and running
   - macOS: `brew install --cask docker` if missing, then open Docker
b) Create Dockerfile
   - Focus: language runtimes, system packages, global tools
   - NOT project-specific dependencies
   - Propose Dockerfile, get confirmation
   - Build and tag as `warp-env:<repo_name>`
c) Build for AMD64/x86_64 architecture
d) Push to Docker Hub: `docker push`
   - Use `docker login` if needed

## Phase 2: Code Fetching

Handled automatically by Oz - repository cloned into environment.

## Phase 3: Workspace Setup

### 6. Setup Commands Analysis

Analyze repo documentation (README.md, WARP.md, docs/) to identify setup commands.

**Be intelligent about base image:**
- **Official language images** (node:*, python:*, golang:*, rust:*): Include runtime/package managers, NOT project deps → likely need dependency install commands
- **Specialized dev images** (debian:bookworm with tools): Check what's included
- **Custom images**: Consider what Dockerfile handles

**Common scenarios:**
- Node.js with node:* → NEED `npm install` or `yarn install`
- Python with python:* → NEED `pip install -r requirements.txt` or `poetry install`
- Go with golang:* → May NOT need `go mod download` (fetched during build)
- Rust with rust:* → May need `cargo build`
- Multi-language → Consider each stack's needs

**Focus ONLY on:**
- Fetch dependencies or set up workspace for development
- NOT already handled by Docker image
- NOT for live testing/running (avoid: npm start, npm run dev, python manage.py runserver, go run, cargo run)

If Docker image handles most setup, may need few/no commands.

### 7. Setup Commands Confirmation

**Repos cloned into workspace directory. Commands assume workspace root as cwd.**

Format requirements:
- Use relative paths (no leading "/")
- Wrap full command in double quotes
- **Single-repo**: Prefix with `cd <repo_name> &&`
- **Multi-repo**: Navigate to appropriate repo dir using relative paths

Examples:
- Instead of `npm install` → `"cd my-repo && npm install"`
- Alternative: `"npm -C my-repo install"`
- Multi-repo: `"cd warp-internal && cargo build"` + `"cd warp-server && go mod download"`

**MANDATORY STOP POINT:**
Present: "I found these setup commands: [LIST_COMMANDS_WITH_CD_AND_QUOTES]. These will run automatically after the code is fetched. Are these correct, or do you need to add/remove any commands?"

**DO NOT CONTINUE** until user responds.

## 8. Environment Creation

**CLI Command Detection:**
Detect which Oz CLI binary to use:
- Dev/staging: `warp` (or `warp-cli` on Linux)
- Production: `warp` (or `warp-cli` on Linux)
- Local: `warp-local` (or `warp-cli-local` on Linux)
- Preview: `warp-preview` (or `warp-cli-preview` on Linux)

Run `<candidate> --version` to confirm availability.

**Command:**
```bash
oz environment create \
  --name <repo_name> \
  --docker-image <selected_image> \
  --repo <owner/repo> \
  [--repo <owner/repo2> ...] \
  --setup-command "<command>" \
  [--setup-command "<command2>" ...]
```

Returns environment UID for next step.

## 9. Final Summary

Provide:
- Environment name and UID created
- Docker image used
- Setup commands that run automatically
- "Environment with <environment_uid> is now ready to be used with your integrations!"
- Demo command:
  ```bash
  oz integration create [provider] --environment <environment_uid>
  ```
  where [provider] = linear or slack. Add `--help` for details.
- If warning about public repos with GitHub auth URL: "Warning: the following repos will only be read-only access for this environment: <repos>. If you want more access, authorize with GitHub at this link: <URL>"

**Cleanup:** Remove tmp directory if created.

## Critical Rules

- **MUST stop** at two MANDATORY STOP POINTS (base image confirmation + setup commands confirmation)
- **DO NOT continue** past stop points automatically
- For other steps: proceed automatically unless genuinely need information you can't determine
- Refer to environment as "oz environment" (NOT "Cloud Environment")
- **NEVER** `cd` into temporary directories (e.g. `cd /tmp/...`, `cd ./tmp-*`)
- All temp directory interactions use absolute paths while keeping working directory unchanged
- If constructing command with `cd` into temp dir → correct to absolute path instead
- Don't say "mandatory stop point" to user - just "stop" and wait
