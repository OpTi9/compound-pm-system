# Architecture Specification
## Compound PM System - Technical Details

**Version:** 1.0  
**Date:** 2026-02-15

---

## 1. Directory Structure

```
.claude/
├── CLAUDE.md                 # Master instructions file
├── AGENTS.md                 # Agent registry and definitions
├── COMMANDS.md               # Command registry
│
├── agents/                   # Agent definitions
│   ├── core/                 # CCPM base agents (4)
│   │   ├── code-analyzer.md
│   │   ├── file-analyzer.md
│   │   ├── test-runner.md
│   │   └── parallel-worker.md
│   │
│   ├── specialized/          # Compound agents (29)
│   │   ├── review/           # 15 review agents
│   │   ├── research/         # 5 research agents
│   │   ├── design/           # 3 design agents
│   │   ├── workflow/         # 5 workflow agents
│   │   └── docs/             # 1 documentation agent
│   │
│   └── planning/             # Planning pair (2) ⭐ NEW
│       ├── avery-architect.md
│       └── rex-auditor.md
│
├── commands/                 # Command definitions
│   ├── pm/                   # Project management (20+)
│   │   ├── prd-new.md
│   │   ├── prd-parse.md
│   │   ├── epic-decompose.md
│   │   ├── epic-sync.md
│   │   ├── epic-start.md
│   │   ├── issue-start.md
│   │   ├── next.md
│   │   └── ...
│   │
│   ├── workflows/            # Compound workflows (5)
│   │   ├── plan.md
│   │   ├── work.md
│   │   ├── review.md
│   │   ├── compound.md
│   │   └── brainstorm.md
│   │
│   ├── quality/              # Quality gates (3) ⭐ NEW
│   │   ├── preflight.md
│   │   ├── postflight.md
│   │   └── deep-review.md
│   │
│   └── context/              # Context management (3)
│       ├── create.md
│       ├── update.md
│       └── prime.md
│
├── context/                  # Project knowledge
│   ├── project.yaml          # Project metadata
│   ├── conventions.md        # Code conventions
│   ├── architecture.md       # Architecture decisions
│   └── patterns.md           # Known patterns
│
├── epics/                    # Active epics (gitignored)
│   └── [epic-name]/
│       ├── epic.md           # Epic definition
│       ├── 001.md            # Task files
│       ├── 002.md
│       └── updates/          # Work-in-progress
│
├── prds/                     # Product requirements
│   └── [prd-name].md
│
├── learnings/                # Compounded knowledge ⭐ KEY
│   ├── patterns/             # Reusable patterns
│   ├── gotchas/              # Problems and solutions
│   └── decisions/            # ADRs
│
├── skills/                   # Skills definitions (20+)
│   ├── architecture/
│   ├── development/
│   ├── workflow/
│   └── planning/             # ⭐ NEW
│
└── scripts/                  # Helper scripts
    ├── install.sh
    ├── sync.sh
    └── backup.sh
```

---

## 2. Component Specifications

### 2.1 Agent Definition Format

```markdown
---
name: agent-name
description: "What this agent does"
model: claude|codex|minimax|inherit
role: description of role
tools: [Read, Write, Bash, Task, Grep]
---

# Agent Name

## Purpose
What this agent is for.

## When to Use
Examples of usage.

## Instructions
Detailed instructions for the agent.

## Examples
<examples>
<example>
Context: ...
User: ...
Assistant: ...
<commentary>...</commentary>
</example>
</examples>
```

### 2.2 Command Definition Format

```markdown
---
name: command-name
description: "What this command does"
argument-hint: "[expected arguments]"
allowed-tools: [Read, Write, Bash, Task]
---

# Command Title

## Introduction
Overview of the command.

## Usage
```bash
claude /command-name [arguments]
```

## Steps
1. Step one
2. Step two
3. Step three

## Output
What the command produces.

## Error Handling
How errors are handled.
```

### 2.3 Skill Definition Format

```markdown
---
name: skill-name
description: "What this skill does"
keywords: [keyword1, keyword2]
---

# Skill Title

## Overview
What this skill provides.

## When to Use
Usage scenarios.

## Instructions
How to use the skill.

## Examples
Example usage.
```

---

## 3. Data Models

### 3.1 PRD (Product Requirements Document)

```yaml
---
title: Feature Name
type: feature|bug|refactor
status: draft|active|completed
date: YYYY-MM-DD
---

# Feature Name

## Overview
High-level description.

## Problem Statement
What problem this solves.

## Proposed Solution
How we solve it.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Technical Considerations
Architecture, performance, security.

## References
Links and related docs.
```

### 3.2 Epic

```yaml
---
title: Epic Name
status: planning|ready|in-progress|completed
prd: prd-name
date: YYYY-MM-DD
---

# Epic Name

## Overview
What this epic accomplishes.

## Technical Approach
How we'll implement it.

## Tasks
- [ ] Task 1 (#001)
- [ ] Task 2 (#002)

## Dependencies
What this depends on.

## Risks
Potential issues.
```

### 3.3 Task

```yaml
---
id: "001"
epic: epic-name
title: Task Title
status: todo|in-progress|review|done
parallel: true|false
estimates:
  hours: 4
  cost: "$2-3"
---

# Task Title

## Description
What needs to be done.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Implementation Notes
Technical details.

## Related
Links to related files.
```

---

## 4. Integration Points

### 4.1 GitHub API

**Authentication:**
- GitHub CLI (`gh`)
- Token: `gh auth token`

**Operations:**
```bash
# Create issue
gh issue create --title "..." --body-file file.md

# Create sub-issue
gh issue create --title "..." --body-file file.md --parent #123

# Add comment
gh issue comment #123 --body-file update.md

# Update labels
gh issue edit #123 --add-label "status:in-progress"
```

### 4.2 Git Worktrees

**Structure:**
```
project/
├── main/                 # Main branch
└── epic-feature/         # Worktree for epic
    ├── .git              # Same git, different HEAD
    └── ...
```

**Commands:**
```bash
# Create worktree
git worktree add ../epic-feature-name epic-feature-branch

# Remove worktree
git worktree remove ../epic-feature-name
```

### 4.3 Model APIs

**Claude (Anthropic):**
```javascript
// Using Claude Code CLI
claude /command [args]

// Direct API
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [{ role: 'user', content: prompt }]
});
```

**Codex (OpenAI):**
```javascript
// Using Codex CLI
codex review file.md

// Direct API
const response = await openai.chat.completions.create({
  model: 'codex-1',
  messages: [{ role: 'user', content: prompt }]
});
```

**MiniMax:**
```javascript
const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${MINIMAX_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'MiniMax-M2.5',
    messages: [{ role: 'user', content: prompt }]
  })
});
```

---

## 5. Workflow Engine

### 5.1 Planning Workflow

```
Trigger: /pm:prd-new [name]
    │
    ▼
Avery (Claude)
    ├─→ Brainstorm with user
    ├─→ Create PRD draft
    └─→ Save to .claude/prds/
    │
    ▼
Auto-trigger: Planning Pair
    │
    ├─→ Avery: Initial architecture v0.1
    │       ↓
    ├─→ Rex: Review → Feedback v0.1
    │       ↓
    ├─→ Avery: Refinement v0.2
    │       ↓
    ├─→ Rex: Deep review → Feedback v0.2
    │       ↓
    └─→ [Iterate until approved]
    │
    ▼
Result: Air Tight Plan
    │
    ▼
Save: .claude/prds/[name].md (final)
```

### 5.2 Implementation Workflow

```
Trigger: /pm:epic-start [name]
    │
    ▼
Read: .claude/epics/[name]/
    │
    ▼
Parallel Worker (CCPM)
    ├─→ Spawn MiniMax Agent 1 (Task 1)
    ├─→ Spawn MiniMax Agent 2 (Task 2)
    ├─→ Spawn MiniMax Agent 3 (Task 3)
    └─→ ...
    │
    ▼
All Agents Work in Parallel
    (Same worktree, different files)
    │
    ▼
Consolidate Results
    │
    ▼
Update: GitHub issues with progress
```

### 5.3 Review Workflow

```
Trigger: /pm:postflight [name]
    │
    ▼
Collect: All code changes
    │
    ▼
Review Swarm (Parallel)
    ├─→ kieran-reviewer: Code quality
    ├─→ dhh-reviewer: Style/conventions
    ├─→ security-sentinel: Security
    ├─→ performance-oracle: Performance
    └─→ simplicity-reviewer: Complexity
    │
    ▼
Aggregate: Consolidated report
    │
    ▼
Decision: ✅ Approve / ❌ Needs work
```

---

## 6. Configuration

### 6.1 User Settings

`~/.claude/settings.json`:
```json
{
  "apiKeys": {
    "anthropic": "sk-ant-...",
    "openai": "sk-...",
    "minimax": "..."
  },
  "preferences": {
    "planning": {
      "primaryModel": "claude-sonnet-4",
      "reviewModel": "codex",
      "iterationLimit": 5
    },
    "implementation": {
      "primaryModel": "minimax-m2.5",
      "fallbackModel": "claude-sonnet-4"
    },
    "review": {
      "autoReview": true,
      "requiredAgents": [
        "kieran-reviewer",
        "security-sentinel"
      ]
    }
  },
  "github": {
    "autoSync": true,
    "createSubIssues": true
  }
}
```

### 6.2 Project Settings

`.claude/project.json`:
```json
{
  "name": "My Project",
  "type": "rails|node|python|go",
  "conventions": {
    "styleGuide": "kieran",
    "testing": "rspec|jest|pytest",
    "database": "postgres|mysql|mongo"
  },
  "agents": {
    "enabled": ["all"],
    "disabled": ["dhh-rails-reviewer"]
  }
}
```

---

## 7. Error Handling

### 7.1 Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Agent not found` | Missing agent file | Check `.claude/agents/` |
| `GitHub auth failed` | Expired token | Run `gh auth login` |
| `Model API error` | Invalid key | Check `settings.json` |
| `Worktree exists` | Previous epic not cleaned | Run cleanup script |
| `Rate limited` | Too many requests | Add delays, use caching |

### 7.2 Recovery Procedures

**Failed Planning:**
1. Save current state
2. Analyze failure reason
3. Retry with adjustments
4. Escalate to user if needed

**Failed Implementation:**
1. Pause all agents
2. Identify failing task
3. Retry with different approach
4. If still failing, escalate to user

**Failed Review:**
1. Log review failures
2. Continue with partial review
3. Flag for manual review
4. Document in learnings/

---

## 8. Performance Optimization

### 8.1 Caching Strategy

**Cache Levels:**
1. **API Responses:** Cache model responses (TTL: 1 hour)
2. **GitHub Data:** Cache issue lists (TTL: 5 minutes)
3. **Context Files:** Cache parsed context (TTL: session)

**Cache Location:**
```
.claude/.cache/
├── api/
├── github/
└── context/
```

### 8.2 Parallelization

**Safe to Parallelize:**
- Different tasks in same epic
- Independent review agents
- Multiple file analysis

**Not Safe to Parallelize:**
- Same file modifications
- Sequential workflow steps
- Git operations on same branch

### 8.3 Cost Optimization

**Strategies:**
1. Use MiniMax for 95% of implementation
2. Cache and reuse research results
3. Batch GitHub API calls
4. Limit review agents to essential ones

---

**End of Architecture Specification**
