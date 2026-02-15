# Oz Platform Skill

A coding agent skill for interacting with the [Oz platform](https://docs.warp.dev/agent-platform/platform/warp-platform). Coding agents can use this skill to spawn and manage cloud agents, configure environments, and automate tasks via the Oz CLI, REST API, or GitHub Actions.

## Prerequisites

Install the `warp` CLI. This comes pre-installed with [Warp](https://warp.dev), or you can install it separately [following our installation guide](https://docs.warp.dev/reference/cli).

## Installation

Copy this repository into your agent's skills folder:

- **Codex**: `~/.codex/skills/`
- **Claude**: `~/.claude/skills/`
- **Warp or other agents**: `~/.agents/skills/`

```bash
cp -r oz-agent-skill/.agents/skills/ ~/.agents/skills/
```

## Usage

Reference the Oz skill using `/oz` in your coding agent, or by asking the agent to do something with Oz. For example:

```sh
# Create an environment
/oz Create an environment from this repository

# Create a GitHub action
Create an Oz GitHub action for this environment that looks for bug reports. I want it to look at the issue template in the repository, which should be cloned into the environment, and evaluate if the bug report follows that template faithfully. If not, it should use the GitHub CLI to leave a comment to the user. 
```

This skill allows the agent to:

- Spawn cloud agents with custom prompts and environments
- Monitor agent status and view cloud sessions
- Schedule agents to run repeatedly (cron-based)
- Create and manage development environments
- Integrate with GitHub Actions workflows

## Documentation

For usage instructions and detailed guides:

- [Platform overview](https://docs.warp.dev/agent-platform/cloud-agents/cloud-agents-overview)
- [Usage with cron scheduling](https://docs.warp.dev/agent-platform/cloud-agents/triggers/scheduled-agents)
- [Usage within GitHub Actions](https://docs.warp.dev/agent-platform/cloud-agents/integrations/github-actions)
- [Usage from application code with REST API or SDK](https://docs.warp.dev/agent-platform/cloud-agents/platform#oz-agent-api-and-sdk)
