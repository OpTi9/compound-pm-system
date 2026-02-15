---
name: oz
description: Use an Oz REST API and command line to run, configure, and inspect cloud agents
---

# oz

Use the Oz REST API and CLI to:
* Spawn cloud agents
* Get the status of a cloud agent
* Schedule cloud agents to run repeatedly
* Create and manage the environments in which cloud agents run
* Provide secrets for cloud agents to use

## Command Line

The Oz CLI is installed as `oz`. To get help output, use `oz help` or `oz help <subcommand>`. Prefer `--output-format text` to review the response, or `--output-format json` to parse fields with jq.

The most important commands are:
* `oz agent run-cloud`: Spawn a new cloud agent. You can configure the prompt, model, environment, and other settings.
* `oz run list` and `oz run get <run-id>`: List all cloud agent runs, and get details about a particular run. This includes the session link to view that session in the cloud.
* `oz environment list` and `oz environment get`: List available environments, and get more information about a particular environment.
* `oz schedule list` and `oz schedule get`: List scheduled tasks with most recent runs, and get more information about a particular scheduled run.

Most subcommands support the `--output-format json` flag to produce JSON output, which you can pipe into `jq` or other commands.

### Examples

Start a cloud agent, and then monitor its status:

```sh
$ oz agent run-cloud --prompt "Update the login error to be more specific" --environment UA17BXYZ
# ...
Spawned agent with run ID: 5972cca4-a410-42af-930a-e56bc23e07ac
```

```sh
$ oz run get 5972cca4-a410-42af-930a-e56bc23e07ac
# ...
```

Schedule an agent to summarize feedback every day at 8am UTC:

```sh
$ oz schedule create --cron "0 8 * * *" \
--name "GitHub issue summary" \
--prompt "Collect all feedback from new GitHub issues and provide a summary report" \
    --environment UA17BXYZ
```

Create a secret for cloud agents to use:

```sh
$ oz secret create JIRA_API_KEY --team --value-file jira_key.txt --description "API key to access Jira"
```

## REST API

Oz has a REST API for starting and inspecting cloud agents.

All API requests require authentication using an API key.

In addition, there are SDKs for:
* TypeScript and JavaScript: oz-agent-sdk
* Python: oz-agent-sdk

All SDKs have sync and async support, and documentation at the links above.

### API Examples

```sh
curl -L -X POST {{oz_server_url}}/api/v1/agent/run \
    --header 'Authorization: Bearer YOUR_API_KEY' \
    --header 'Content-Type: application/json' \
    --data '{
        "prompt": "Update the login error to be more specific",
        "config": {
            "environment_id": "UA17BXYZ"
        }
    }'
```

```sh
curl -L -X GET {{oz_server_url}}/api/v1/agent/runs/5972cca4-a410-42af-930a-e56bc23e07ac \
    --header 'Authorization: Bearer YOUR_API_KEY' \
    --header 'Content-Type: application/json'
```

## GitHub Actions Integration

You can trigger Oz cloud agents from GitHub Actions workflows. This enables automation like:
* Triaging issues when they're created or labeled
* Running checks on pull requests
* Scheduling periodic tasks via workflow dispatch

### Action Setup

Use your Oz GitHub Action in your workflow. Required inputs:
* `prompt`: The task description for the agent
* `oz_api_key`: API key (store in GitHub secrets, e.g., `${{ secrets.OZ_API_KEY }}`)
* `profile`: Optional agent profile identifier (can use repo variable, e.g., `${{ vars.OZ_AGENT_PROFILE || '' }}`)

The action outputs `agent_output` with the agent's response.

### Minimal Workflow Example

```yaml
name: Run Oz Agent
on:
  issues:
    types: [opened, labeled]

jobs:
  agent:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/oz-agent-action@v1
        id: agent
        with:
          prompt: |
            Analyze the GitHub issue and provide a summary.
            Issue: ${{ github.event.issue.title }}
            ${{ github.event.issue.body }}
          oz_api_key: ${{ secrets.OZ_API_KEY }}
          profile: ${{ vars.OZ_AGENT_PROFILE || '' }}
      - name: Use Agent Output
        run: echo "${{ steps.agent.outputs.agent_output }}"
```

### Common Patterns

**Conditional steps**: Use `if: steps.agent.outputs.agent_output` to branch on agent results.

**Templating**: Use `actions/github-script@v7` to construct dynamic prompts from issue templates, repo context, or code.

**Error handling**: Check action success with `if: success()` or `if: failure()`.

**Git operations**: The action runs with checked-out code and Git credentials, so agents can commit and push changes.

## Environments

All cloud agents run in an environment. The environment defines:
* Which programs are preinstalled for the agent (based on a Docker image)
* The Git repositories to check out before the agent starts
* Setup commands to run, such as `npm install` or `cargo fetch`

You should almost always run cloud agents in an environment. Otherwise, they may not have the necessary code or tools available.

Cloud agents run in a sandbox, so they _can_ install additional programs into their environment. They also have Git credentials to create PRs and push branches.

Cloud environments DO NOT store secret values, like API keys. Use the `oz secret` commands instead.

### Creating Environments

For detailed guidance on creating environments with `oz environment create`, see [create-environment.md](./create-environment.md). This includes:
* Repository detection and analysis
* Docker image selection (prebuilt images or custom)
* Setup command determination
* Full workflow with mandatory confirmation points

## Using Third-Party Coding CLIs

Oz environments support running third-party coding agent CLIs such as Claude Code, Codex, Gemini CLI, Amp, Copilot CLI, and OpenCode. The `-agents` tagged variants of compatible images can come with popular CLIs preinstalled. Base tags (without `-agents`) do not include coding agent CLIs.

For detailed per-CLI documentation (installation, authentication, non-interactive flags, and artifact reporting prompts), see [references/third-party-clis.md](./references/third-party-clis.md).

### Key concepts

1. **Docker images**: Use an `-agents` tagged image when you need third-party coding CLIs preinstalled. Base tags are smaller and do not include coding agent CLIs.
2. **Secrets**: Store API keys as Oz secrets (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) so they are available at runtime.
3. **Non-interactive mode**: Each CLI has a flag for headless execution (e.g. `claude -p`, `codex exec`, `gemini -p`).
4. **Artifact reporting**: When a third-party CLI creates a PR, parse its output for the PR URL and branch name, then call `report_pr` to register the artifact in the workspace UI.

### Quick example

```sh
$ oz agent run-cloud \
    --environment <ENV_ID> \
    --prompt 'Run Claude Code to summarize the architecture: claude -p "Summarize the architecture of this project"'
```
