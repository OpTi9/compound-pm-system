---
name: openclaw-ops
description: Manage, configure, troubleshoot, and operate an OpenClaw personal AI assistant instance. Use when asked to check status, manage channels, configure models, install skills, debug gateway issues, or perform any OpenClaw administration.
---

# OpenClaw Operations

You have access to the `openclaw` CLI for managing this OpenClaw instance. Use it to administer the gateway, channels, models, skills, agents, memory, cron jobs, and more.

## Before You Start

- Config lives at `~/.openclaw/openclaw.json` (JSON5 format — comments OK).
- Workspace is at `~/.openclaw/workspace/` by default.
- Always run `openclaw doctor` when diagnosing issues — it checks config validity, port availability, service status, and auth token expiry.

## Common Operations

### Check System Health
```sh
openclaw status --all --deep
openclaw doctor
openclaw health
```

### Gateway Lifecycle
```sh
openclaw gateway start
openclaw gateway stop
openclaw gateway restart
openclaw logs --follow         # Tail logs
openclaw logs --json           # Machine-readable logs
```
The gateway binds to `ws://127.0.0.1:18789` by default. Override with `--port`. The Control UI is at `http://localhost:18789/`.

After any config file change, restart the gateway or use `config.patch` RPC.

### Configuration
```sh
openclaw config get <dotpath>           # e.g. gateway.port, identity.name
openclaw config set <dotpath> <value>   # e.g. openclaw config set identity.name "Molty"
openclaw config unset <dotpath>
openclaw configure                      # Interactive wizard
```
Config supports `${ENV_VAR}` substitution. Never hardcode secrets — use env vars.

Validate config at any time:
```sh
openclaw doctor
```

### Channel Management
```sh
openclaw channels list
openclaw channels status
openclaw channels add
openclaw channels remove <channel>
openclaw channels login <channel>
openclaw channels logout <channel>
openclaw channels logs --channel <channel>
```

To approve a DM pairing request:
```sh
openclaw pairing approve <channel> <code>
```

Supported channels: WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, BlueBubbles, Microsoft Teams, Matrix, Zalo, WebChat.

### Model Configuration
```sh
openclaw models list
openclaw models status
openclaw models set <provider/model>    # e.g. anthropic/claude-sonnet-4-5
openclaw models auth add                # Add a new auth profile
```

Auth profiles are configured in `openclaw.json` under `auth.profiles`. The `auth.order` map controls failover between profiles.

### Skill Management

Skills are folders containing a `SKILL.md` with YAML frontmatter and markdown instructions, stored in:
- `<workspace>/skills/` (highest precedence)
- `~/.openclaw/skills/` (managed, shared across agents)
- Bundled skills (lowest precedence)

```sh
openclaw skills list
openclaw skills info <name>
openclaw skills check           # Validate all skills
```

To install from ClawHub:
```sh
clawhub install <skill-name>
clawhub sync --all
```

To create a new skill, create `<workspace>/skills/<name>/SKILL.md` with this structure:
```markdown
---
name: my-skill
description: "What this skill does"
emoji: 🔧
requires:
  bins:
    - some-cli-tool
---
# My Skill
Instructions for the agent on how to use this skill...
```

**Security**: Treat third-party skills as untrusted code. Read them before enabling. Check VirusTotal reports on ClawHub.

### Multi-Agent Management
```sh
openclaw agents list
openclaw agents list --bindings    # Show routing bindings
openclaw agents add <name>         # Add new agent (guided wizard)
openclaw agents delete <name>      # Delete agent + workspace
```

Each agent gets its own workspace with independent `AGENTS.md`, `SOUL.md`, `USER.md`, sessions, and skill overrides. Route messages to agents via bindings in config.

### Memory
```sh
openclaw memory status
openclaw memory index              # Re-index workspace for semantic search
openclaw memory search "<query>"   # Semantic search over memory + daily logs
```

Memory files:
- `memory/YYYY-MM-DD.md` — daily logs (auto-generated)
- `MEMORY.md` — curated long-term memory

### Cron / Scheduled Jobs
```sh
openclaw cron list
openclaw cron add                  # Add a scheduled job
openclaw cron edit <id>
openclaw cron rm <id>
openclaw cron enable <id>
openclaw cron disable <id>
openclaw cron runs                 # Recent run history
openclaw cron run <id>             # Trigger a job manually
```

### Browser Automation
```sh
openclaw browser start
openclaw browser stop
openclaw browser tabs
openclaw browser open <url>
openclaw browser screenshot
openclaw browser navigate <url>
```

### Sandbox
```sh
openclaw sandbox list
openclaw sandbox recreate
openclaw sandbox explain
```

### Messaging
```sh
openclaw message send --to <recipient> --message "Hello"
openclaw agent --message "Do something" --thinking high
```

### Security
```sh
openclaw security audit            # Check for security misconfigurations
openclaw security audit --fix      # Auto-fix issues
```

Key security practices:
- Use `per-channel-peer` session scope for multi-user inboxes to prevent context leakage.
- Run the gateway behind a reverse proxy or Tailscale for remote access — never expose port 18789 directly.
- Use sandbox mode (`agents.defaults.sandbox`) for untrusted inputs.
- Keep secrets in env vars, not in config or prompts.

## Troubleshooting

When something goes wrong, follow this sequence:

1. **`openclaw doctor`** — validates config, checks ports, services, auth tokens.
2. **`openclaw logs --follow`** — check for runtime errors.
3. **`openclaw status --all --deep`** — full diagnosis with usage stats.
4. **`openclaw channels status`** — check if channels are connected.
5. **`openclaw security audit`** — check for misconfigurations.

### Common Issues

- **Gateway won't start / port in use**: Another process on 18789. Use `openclaw doctor` or `--port <other>`.
- **Channel disconnected**: Run `openclaw channels login <channel>` to re-authenticate.
- **Skill not detected**: Ensure the skill folder is in the correct path and run `openclaw skills check`.
- **Config rejected on boot**: Unknown keys or invalid values. Run `openclaw doctor` to validate and repair.
- **High token usage**: Keep workspace files (`AGENTS.md`, `SOUL.md`, etc.) concise. Large files get truncated at `agents.defaults.bootstrapMaxChars` (default: 20,000 chars).
- **Auth failures / 1008**: Refresh expired OAuth tokens via `openclaw doctor` or re-run `openclaw models auth add`.

## Updating OpenClaw
```sh
npm install -g openclaw@latest
openclaw doctor                    # Run post-update migrations
openclaw gateway restart
```

Switch release channels:
```sh
openclaw update --channel stable   # Tagged releases
openclaw update --channel beta     # Prereleases
```
