# AGENTS.md — Operating Instructions

You are running in an environment with OpenClaw installed. OpenClaw is a self-hosted, multi-channel AI agent gateway. Your primary job is to help manage, operate, and troubleshoot this OpenClaw instance.

## Environment Layout

- **Config file**: `~/.openclaw/openclaw.json` (JSON5 — comments and trailing commas are OK)
- **Workspace**: `~/.openclaw/workspace/` (default; override via `agents.defaults.workspace`)
- **Managed skills**: `~/.openclaw/skills/`
- **Workspace skills**: `<workspace>/skills/`
- **Sessions**: `~/.openclaw/sessions/` (JSONL transcripts)
- **Cron jobs**: `~/.openclaw/cron/jobs.json`
- **Logs**: `openclaw logs --follow`

## Key Workspace Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Operating instructions (this file) |
| `SOUL.md` | Persona, tone, and boundaries |
| `IDENTITY.md` | Agent name, vibe, emoji |
| `USER.md` | User profile and preferences |
| `TOOLS.md` | Notes on local tools and conventions |
| `HEARTBEAT.md` | Checklist for heartbeat runs (keep short) |
| `BOOTSTRAP.md` | One-time first-run ritual (delete after) |
| `memory/` | Daily logs + long-term memory |

These files are injected into context at the start of each session. Keep them concise to avoid token waste.

## Essential CLI Commands

### Gateway Management
```
openclaw gateway start          # Start the gateway
openclaw gateway stop           # Stop the gateway
openclaw gateway restart        # Restart the gateway
openclaw gateway --port 18789 --verbose  # Run with custom port and verbose output
openclaw status --all --deep    # Full system diagnosis
openclaw health                 # Quick health check
openclaw doctor                 # Run health checks, migrations, and auto-repair
```

### Configuration
```
openclaw config get <key>       # Read a config value (dot notation)
openclaw config set <key> <val> # Set a config value
openclaw config unset <key>     # Remove a config value
openclaw configure              # Interactive section-based config editor
openclaw setup                  # Initialize config + workspace (seed missing files)
```

### Channels
```
openclaw channels list          # List configured channels
openclaw channels status        # Channel connection status
openclaw channels add           # Add a new channel
openclaw channels remove <ch>   # Remove a channel
openclaw channels login <ch>    # Authenticate a channel
openclaw channels logs --channel <ch>  # Channel-specific logs
openclaw pairing approve <channel> <code>  # Approve a DM pairing request
```

### Models
```
openclaw models list            # List available models
openclaw models status          # Current model config
openclaw models set <model>     # Switch model
openclaw models auth add        # Add auth profile
```

### Skills
```
openclaw skills list            # List installed skills
openclaw skills info <name>     # Skill details
openclaw skills check           # Validate skills
```

### Memory & Sessions
```
openclaw memory status          # Memory index status
openclaw memory index           # Re-index memory
openclaw memory search <query>  # Semantic search over memory
openclaw sessions               # List stored sessions
```

### Agents (Multi-Agent)
```
openclaw agents list            # List configured agents
openclaw agents add <name>      # Add a new agent
openclaw agents delete <name>   # Delete an agent
```

### Messaging
```
openclaw message send --to <recipient> --message "text"  # Send a message
openclaw agent --message "prompt" --thinking high         # Run one agent turn
```

### Browser, Cron, Sandbox
```
openclaw browser start|stop|tabs|screenshot|navigate
openclaw cron list|add|edit|rm|enable|disable|runs|run
openclaw sandbox list|recreate|explain
```

### Diagnostics & Security
```
openclaw logs --follow          # Tail gateway logs
openclaw logs --json            # JSON-formatted logs
openclaw security audit         # Audit config for security issues
openclaw security audit --fix   # Auto-fix security issues
```

## Operating Guidelines

1. **Always run `openclaw doctor`** after config changes or when something seems off.
2. **Restart the gateway** after editing `openclaw.json` (or use `config.patch` RPC for live updates).
3. **Treat third-party skills as untrusted code** — read them before enabling.
4. **Keep workspace files short** — they are injected into every session and burn tokens.
5. **Use `--json` flag** when you need machine-readable output for scripting.
6. **Use `openclaw security audit`** before exposing anything externally.
7. **DM policy**: use `per-channel-peer` for multi-user inboxes to prevent context leakage.
8. **Secrets**: use environment variable substitution (`${VAR_NAME}`) in config — never hardcode keys.

## Troubleshooting Quick Reference

- **"command not found"**: Restart terminal so PATH picks up the global npm bin.
- **Gateway hangs / port in use**: Run `openclaw doctor` for port and process checks. Use `--port` to pick a different port.
- **Token / 1008 unauthorized**: Pass the token via `openclaw gateway --token <TOKEN>` or use a tokenized dashboard URL.
- **Config validation errors**: Run `openclaw doctor` — it validates against the Zod schema and can auto-repair.
- **Skill not loading**: Check `openclaw skills check` and ensure binary dependencies are installed.
