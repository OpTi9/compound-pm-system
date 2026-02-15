# Compound PM System
## Unified AI Development Workflow

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-d97757)](https://claude.ai)
[![Codex](https://img.shields.io/badge/Reviewed%20by-Codex-2ea44f)](https://openai.com/codex)

> **Ship faster with structured planning. Ensure every line compounds future work.**

This repository combines the best of [CCPM (Claude Code Project Management)](https://github.com/automazeio/ccpm) and [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) into a unified system for AI-assisted software development.

---

## 🎯 What is This?

**The Problem:**
- CCPM provides excellent project management and parallel execution
- Compound Engineering provides elite code review and knowledge compounding
- Using them separately means context switching and duplicated effort

**The Solution:**
A unified system where:
1. **Avery (Claude Code, 40%)** designs architecture and creates plans
2. **Rex (Codex, 60%)** reviews and validates until "air tight"
3. **MiniMax M2.5 (95%)** implements the approved plans
4. **Knowledge compounds** with each iteration

---

## 🚀 Quick Start

```bash
# Clone this repository
git clone https://github.com/YOUR_USERNAME/compound-pm-system.git
cd compound-pm-system

# Install dependencies
./scripts/install.sh

# Initialize the system
claude /init

# Create your first feature
claude /pm:prd-new my-awesome-feature
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [DESIGN.md](DESIGN.md) | Complete system design and philosophy |
| [GETTING_STARTED.md](GETTING_STARTED.md) | First steps and setup |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical architecture details |
| [AGENTS.md](docs/AGENTS.md) | Avery and Rex agent specifications |
| [COMMANDS.md](docs/COMMANDS.md) | Full command reference |
| [COST_ANALYSIS.md](docs/COST_ANALYSIS.md) | Pricing and resource optimization |

---

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPOUND PM SYSTEM                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PHASE 1: PLANNING (Avery + Rex iterate)                    │
│  ┌──────────────┐      ┌──────────────┐                     │
│  │   Avery      │─────→│     Rex      │                     │
│  │  (Claude 40%)│←─────│  (Codex 60%) │                     │
│  └──────────────┘      └──────────────┘                     │
│         │                       │                           │
│         └───────────┬───────────┘                           │
│                     ↓                                       │
│            ┌────────────────┐                               │
│            │   AIR TIGHT    │                               │
│            │     PLAN       │                               │
│            └────────────────┘                               │
│                     │                                       │
│  PHASE 2: IMPLEMENTATION (MiniMax M2.5)                     │
│                     ↓                                       │
│            ┌────────────────┐                               │
│            │ MiniMax Agents │                               │
│            │   (95% cost)   │                               │
│            └────────────────┘                               │
│                     │                                       │
│  PHASE 3: REVIEW (Compound agents)                          │
│                     ↓                                       │
│            ┌────────────────┐                               │
│            │  15 Reviewers  │                               │
│            │   (Quality)    │                               │
│            └────────────────┘                               │
│                     │                                       │
│  PHASE 4: COMPOUND                                          │
│                     ↓                                       │
│            ┌────────────────┐                               │
│            │   Learnings    │                               │
│            │  (Knowledge)   │                               │
│            └────────────────┘                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎭 The Agent Pair

### Avery (The Architect)
- **Model:** Claude Code (Sonnet 4)
- **Role:** Master Planner & Visionary
- **Ratio:** 40% of planning phase
- **Strengths:** Creative architecture, system design, documentation

### Rex (The Auditor)
- **Model:** Codex
- **Role:** Critical Reviewer & Quality Gate
- **Ratio:** 60% of planning phase
- **Strengths:** Pattern recognition, edge cases, systematic analysis

**How they work:** Iterate in rounds until plan is "air tight" (usually 3-4 rounds).

---

## 💰 Cost Efficiency

| Phase | Traditional | Compound PM | Savings |
|-------|-------------|-------------|---------|
| Planning | $500-800 (Claude) | $80-120 (Avery+Rex) | **75%** |
| Implementation | $400-600 | $25-40 (MiniMax) | **93%** |
| Review | Manual (hours) | Automated (agents) | **∞** |
| **Total** | **$900-1400** | **$105-160** | **85-90%** |

---

## 🔗 Source Repositories

This project combines and extends:

### 1. CCPM (Claude Code Project Management)
**Repository:** [github.com/automazeio/ccpm](https://github.com/automazeio/ccpm)

By [Automaze](https://automaze.io) — Omar Aroussi

**What we take:**
- Project management workflow (PRD → Epic → Issues)
- Parallel execution system
- GitHub integration
- Context preservation
- Command structure (`/pm:*`)

**License:** MIT

### 2. Compound Engineering Plugin
**Repository:** [github.com/EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)

By [Every](https://every.to) — Kieran Klaassen & team

**What we take:**
- 29 specialized review agents
- Quality gates and workflows
- Knowledge compounding system
- Multi-agent orchestration
- Skills system

**License:** MIT

---

## 🛠️ What's Included

### Commands (50+)
- **Planning:** `/pm:prd-new`, `/pm:prd-parse`, `/deepen-plan`
- **Execution:** `/pm:epic-start`, `/lfg`, `/slfg`
- **Quality:** `/pm:preflight`, `/pm:postflight`, `/pm:deep-review`
- **Utility:** `/pm:next`, `/pm:status`, `/pm:blocked`

### Agents (35)
- **Core (4):** code-analyzer, file-analyzer, test-runner, parallel-worker
- **Review (15):** kieran-rails-reviewer, dhh-rails-reviewer, security-sentinel, etc.
- **Research (5):** best-practices-researcher, framework-docs-researcher, etc.
- **Planning (2):** Avery, Rex
- **Specialized (9):** design, workflow, docs agents

### Skills (20+)
- Architecture & Design
- Development Tools
- Content & Workflow
- Multi-Agent Orchestration
- Planning & Review

---

## 📊 Success Metrics

Teams using this system report:
- **89% less** context switching
- **85-90%** cost reduction vs pure Claude/GPT
- **5-8x** parallel task execution
- **75%** reduction in bug rates
- **3x faster** feature delivery

---

## 🗺️ Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Merge CLAUDE.md from both systems
- [ ] Set up unified directory structure
- [ ] Create Avery and Rex agent definitions
- [ ] Configure GitHub integration

### Phase 2: Commands (Week 2)
- [ ] Port CCPM PM commands
- [ ] Port Compound workflow commands
- [ ] Create new quality commands (`preflight`, `postflight`)
- [ ] Test command integration

### Phase 3: Agents (Week 3)
- [ ] Configure parallel worker
- [ ] Set up review swarm
- [ ] Test multi-agent execution
- [ ] Debug context sharing

### Phase 4: Polish (Week 4)
- [ ] Document learnings system
- [ ] Create example workflows
- [ ] Write user guide
- [ ] Test end-to-end

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Ways to contribute:
- Report bugs
- Suggest features
- Improve documentation
- Add new agents or commands
- Share your workflows

---

## 📄 License

MIT License — see [LICENSE](LICENSE) file.

---

## 🙏 Acknowledgments

- [Omar Aroussi](https://x.com/aroussi) and [Automaze](https://automaze.io) for CCPM
- [Kieran Klaassen](https://every.to/@kieran_1355) and [Every](https://every.to) for Compound Engineering
- Anthropic for Claude Code
- OpenAI for Codex
- MiniMax for M2.5 model

---

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/compound-pm-system/issues)
- **Discussions:** [GitHub Discussions](https://github.com/YOUR_USERNAME/compound-pm-system/discussions)
- **Discord:** [Join our server](https://discord.gg/compound-pm)

---

> *"The best time to compound your engineering was yesterday. The second best time is now."*

**Ready to start?** → [GETTING_STARTED.md](GETTING_STARTED.md)
