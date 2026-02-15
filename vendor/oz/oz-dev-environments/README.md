# Oz Dev Environment Docker Images

This repository contains prebuilt Docker images for use with
Oz environments. These images
provide ready-to-use development environments for running
Oz cloud agents and
integrations (Slack, Linear,
GitHub Actions).

An Oz environment defines the
execution context for an Oz cloud agent run: the **Docker image**, **repositories to clone**,
**setup commands**, and **runtime configuration**. These images handle the Docker image part so
you can get started quickly.

## Quickstart

To get started, you'll need to have the Oz CLI installed and authenticated.

### 1. Create an environment

Create an environment using one of the prebuilt images:

```bash
oz environment create \
  --name my-go-env \
  --docker-image warpdotdev/dev-go:1.23 \
  --repo octocat/hello-world \
  --setup-command "go mod download"
```

Alternatively, use your Oz control plane UI to create environments with a guided
flow to auto-detect your project's languages and suggest an appropriate image.

### 2. Run Oz agents

Once your environment is ready, you can:

- **Run Oz agents** from the CLI, your control plane UI, or the
  Oz Agent API & SDK:

```bash
oz agent run-cloud --environment env_abc123 --prompt "Fix the failing tests in src/"
```

- **Create integrations** so agents run automatically from Slack, Linear, or GitHub Actions:

```bash
oz integration create slack --environment env_abc123
```

- **Schedule agents** to run on a cron schedule for recurring tasks:

```bash
oz schedule create \
  --name "Weekly dependency updates" \
  --cron "0 10 * * 1" \
  --environment env_abc123 \
  --prompt "Check for dependency updates and open a PR"
```

- **Run skill-based agents** using reusable
  skills from your repos:

```bash
oz agent run-cloud \
  --environment env_abc123 \
  --skill "owner/repo:code-review" \
  --prompt "Review the latest PR"
```

## Available images

All images are based on Ubuntu. Language-specific images extend the base image with additional
runtimes. Each image is published in two variants:

- **Base** (e.g. `warpdotdev/dev-rust:1.85`) — language runtimes and core tools only
- **Agents** (e.g. `warpdotdev/dev-rust:1.85-agents`) — same as base, plus preinstalled coding
  agent CLIs

| Image | Tag | Contents |
|-------|-----|----------|
| **warpdotdev/dev-base** | `latest` / `latest-agents` | Node 22 + Python 3 |
| **warpdotdev/dev-go** | `1.23` / `1.23-agents` | Go 1.23.4 + base |
| **warpdotdev/dev-rust** | `1.83` / `1.83-agents` | Rust 1.83.0 + base |
| **warpdotdev/dev-rust** | `1.85` / `1.85-agents` | Rust 1.85.0 + base |
| **warpdotdev/dev-java** | `21` / `21-agents` | Temurin JDK 21, Maven, Gradle + base |
| **warpdotdev/dev-dotnet** | `8.0` / `8.0-agents` | .NET SDK 8.0 + base |
| **warpdotdev/dev-ruby** | `3.3` / `3.3-agents` | Ruby 3.3 + Bundler + base |
| **warpdotdev/dev-web** | `latest` / `latest-agents` | Google Chrome, Firefox + base |
| **warpdotdev/dev-full** | `latest` / `latest-agents` | All languages + base |

All images include `git`, `curl`, `build-essential`, and `ca-certificates`.

## Coding agent CLIs (`-agents` variants)

If you want to use a different harness from Oz's main agent, you can use Oz to
orchestrate other coding agents. We have prebuilt Docker images for popular agents
like Claude Code, Codex, Gemini and Copilot.

The `-agents` tagged images include the following preinstalled coding agent CLIs:

- [Claude Code](https://github.com/anthropics/claude-code) (`claude`)
- [Codex CLI](https://github.com/openai/codex) (`codex`)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) (`gemini`)
- [GitHub CLI](https://cli.github.com) (`gh`) — useful for Copilot CLI and git workflows

Each CLI authenticates via environment variables (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GEMINI_API_KEY`). Store these as
Oz secrets so they are
available at runtime.

If you don't need third-party coding agent CLIs, use the base tags (without `-agents`) for
smaller image sizes.

## Using a custom image

If the prebuilt images don't cover your stack, you can use any publicly accessible Docker Hub
image:

```bash
oz environment create \
  --name my-custom-env \
  --docker-image my-org/my-image:latest \
  --repo octocat/hello-world
```

You can also extend one of the prebuilt images in your own Dockerfile:

```dockerfile
FROM warpdotdev/dev-base:latest
RUN apt-get update && apt-get install -y your-package
```

## Helpful tips

- **Guided setup** — Use your control plane UI for guided setup that detects your project's
  languages and suggests the appropriate image and setup commands.
- **One environment, many triggers** — Create one environment per codebase, then reuse it across
  Slack, Linear, CLI runs, schedules, and API calls.
- **Secrets** — For credentials and sensitive data, use
  Oz agent secrets rather than baking tokens into your image.

## Documentation

Refer to your control plane's documentation for:
- Oz environments
- Oz cloud agents
- Skills and integrations
- Oz CLI and API/SDK
