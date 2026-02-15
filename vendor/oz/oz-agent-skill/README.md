# Oz Platform Skill

A coding agent skill for interacting with an Oz control plane. Coding agents can use this skill to spawn and manage cloud agents, configure environments, and automate tasks via the Oz CLI, REST API, or GitHub Actions.

## Prerequisites

Install the Oz CLI (`oz`) and ensure it is authenticated against your control plane.

## Installation

Copy this repository into your agent's skills folder:

- **Codex**: `~/.codex/skills/`
- **Claude**: `~/.claude/skills/`
- **Other agents**: `~/.agents/skills/`

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

Refer to your control plane's documentation for usage instructions and detailed guides.
