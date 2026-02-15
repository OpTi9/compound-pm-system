# Getting Started with Compound PM System

Welcome! This guide will get you up and running with the Compound PM System in under 10 minutes.

---

## 📋 Prerequisites

Before you begin, ensure you have:

### Required
- [ ] **Git** — Version control
- [ ] **GitHub CLI (`gh`)** — GitHub integration
- [ ] **Claude Code** — For Avery (the Architect)
- [ ] **Node.js 18+** — For tooling

### Optional but Recommended
- [ ] **Codex CLI** — For Rex (the Auditor)
- [ ] **MiniMax API access** — For implementation (or use Claude as fallback)
- [ ] **Bun** — Faster JavaScript runtime

---

## 🚀 Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/compound-pm-system.git
cd compound-pm-system
```

### Step 2: Run Install Script

```bash
./scripts/install.sh
```

This will:
- Check prerequisites
- Install dependencies
- Set up directory structure
- Configure GitHub CLI (if needed)

### Step 3: Configure API Keys

Create `~/.claude/settings.json`:

```json
{
  "apiKeys": {
    "anthropic": "YOUR_ANTHROPIC_KEY",
    "openai": "YOUR_OPENAI_KEY",
    "minimax": "YOUR_MINIMAX_KEY"
  },
  "preferences": {
    "defaultPlanningModel": "claude-sonnet-4",
    "defaultReviewModel": "codex",
    "defaultImplementationModel": "minimax-m2.5"
  }
}
```

### Step 4: Initialize the System

```bash
claude /init
```

This will:
- Load CLAUDE.md instructions
- Verify agent configurations
- Test GitHub connectivity
- Create sample structure

---

## 🎯 Your First Feature

Let's create a simple feature to see the system in action.

### Step 1: Create a PRD

```bash
claude /pm:prd-new user-authentication
```

**What happens:**
- Avery (Claude) launches brainstorming
- You'll answer questions about the feature
- Output: `.claude/prds/user-authentication.md`

### Step 2: Plan Reviews Itself (Avery + Rex)

The system automatically initiates the planning pair:

```
Avery: Creates initial architecture
  ↓
Rex: Reviews and provides feedback
  ↓
Avery: Refines based on feedback
  ↓
Rex: Approves as "air tight"
```

**Takes:** 10-15 minutes  
**Cost:** ~$5-8 (Avery + Rex iteration)

### Step 3: Convert to Epic

```bash
claude /pm:prd-parse user-authentication
```

**Output:** `.claude/epics/user-authentication/epic.md`

### Step 4: Decompose into Tasks

```bash
claude /pm:epic-decompose user-authentication
```

**Output:**
- `.claude/epics/user-authentication/001.md`
- `.claude/epics/user-authentication/002.md`
- `.claude/epics/user-authentication/003.md`

### Step 5: Push to GitHub

```bash
claude /pm:epic-oneshot user-authentication
```

**What happens:**
- Creates GitHub issues
- Sets up parent-child relationships
- Applies labels

### Step 6: Start Implementation

```bash
claude /pm:epic-start user-authentication
```

**What happens:**
- MiniMax M2.5 agents spawn
- Parallel work on all tasks
- Progress tracked in real-time

**Takes:** 20-40 minutes  
**Cost:** ~$3-5 (MiniMax)

### Step 7: Review

```bash
claude /pm:postflight user-authentication
```

**What happens:**
- 15 review agents analyze code
- Security, performance, style checks
- Consolidated report

### Step 8: Compound Knowledge

```bash
claude /workflows:compound user-authentication
```

**What happens:**
- Patterns extracted
- Learnings documented
- Future work made easier

---

## 📊 What You Just Built

In ~1 hour and ~$10:
- ✅ Fully planned feature
- ✅ Implemented code
- ✅ Reviewed by 15 agents
- ✅ Documented for future
- ✅ Tracked in GitHub

**Traditional approach:** 1-2 days, $100-200

---

## 🛠️ Common Commands

### Planning
```bash
claude /pm:prd-new [name]          # Create PRD
claude /pm:prd-list                # List all PRDs
claude /pm:prd-status [name]       # Check PRD status
claude /deepen-plan [file]         # Enhance with research
```

### Execution
```bash
claude /pm:epic-decompose [name]   # Break into tasks
claude /pm:epic-sync [name]        # Push to GitHub
claude /pm:epic-oneshot [name]     # Decompose + sync
claude /pm:epic-start [name]       # Begin parallel work
```

### Quality
```bash
claude /pm:preflight [name]        # Pre-implementation review
claude /pm:postflight [name]       # Post-implementation review
claude /pm:deep-review [id]        # Deep multi-file review
```

### Status
```bash
claude /pm:next                    # Next priority task
claude /pm:status                  # Project dashboard
claude /pm:blocked                 # Show blocked tasks
claude /pm:standup                 # Daily standup report
```

---

## 🎭 Meet Your Agents

### For Planning
- **Avery** (Claude) — Creates architecture
- **Rex** (Codex) — Reviews and validates

### For Implementation
- **MiniMax Army** — Writes code cheaply and fast

### For Review
- **Kieran** — Code quality expert
- **DHH** — Rails/37signals style
- **Security Sentinel** — Security audits
- **Performance Oracle** — Optimization

---

## 💡 Tips for Success

### 1. Start Small
Don't plan a month-long epic initially. Start with 2-3 day features to learn the workflow.

### 2. Trust the Iteration
Avery + Rex will iterate 3-4 times. This is normal and saves time later.

### 3. Review the Review
Read Rex's feedback carefully. It catches issues that would cost 10x more to fix in code.

### 4. Use MiniMax for Implementation
Resist the urge to use Claude for everything. MiniMax is 20x cheaper and just as good for implementation.

### 5. Document Learnings
After each feature, run `/workflows:compound`. Future you will thank present you.

---

## 🐛 Troubleshooting

### "Claude not found"
```bash
npm install -g @anthropics/claude-code
```

### "GitHub auth failed"
```bash
gh auth login
```

### "MiniMax API error"
Check your API key in `~/.claude/settings.json`

### "Agents not responding"
Check that agent files exist in `.claude/agents/`

---

## 📚 Next Steps

- Read [DESIGN.md](DESIGN.md) for full system design
- Check [ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical details
- See [COMMANDS.md](docs/COMMANDS.md) for complete command reference
- Review [COST_ANALYSIS.md](docs/COST_ANALYSIS.md) for pricing optimization

---

## 🤝 Getting Help

- **GitHub Issues:** Report bugs
- **GitHub Discussions:** Ask questions
- **Discord:** [Join our community](https://discord.gg/compound-pm)

---

**Welcome to the future of AI-assisted development!** 🚀
