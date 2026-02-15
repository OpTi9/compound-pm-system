# Oz Skills

A curated collection of reusable [Agent Skills](https://agentskills.io) for Oz and other coding agents.

## What Are Agent Skills?

Agent Skills are markdown files that teach AI agents about your conventions, best practices, and workflows. Agents can automatically discover and use these skills to provide context-aware help.

Think of skills as onboarding guides that help agents understand how you work.

## How Skills Work

- **Skills live in `.agents/skills/` directories** - either in your project (`.agents/skills/`) or globally (`~/.agents/skills/`)
- **Each skill is a folder** containing a `SKILL.md` file with YAML frontmatter and markdown content
- **Agents automatically discover** and load skills when relevant to your current task

## Using These Skills

To use a skill from this repository:

1. Copy the skill folder (e.g., `docs-update`) from `.agents/skills/` 
2. Paste it into your project's `.agents/skills/` directory, or
3. Paste it into `~/.agents/skills/` to use it across all projects

Your agent runtime may automatically detect the new skill on your next interaction.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding skills.

## Learn More

- [Agent Skills Specification](https://agentskills.io)
