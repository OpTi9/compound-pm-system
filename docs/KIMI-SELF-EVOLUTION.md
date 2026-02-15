# Kimi Self-Evolution System
## Self-Improving Agent Architecture

**Version:** 1.0  
**Date:** 2026-02-15  
**Model:** Kimi Code Moderato (K2.5)  
**Status:** Specification

---

## 1. OVERVIEW

### The Breakthrough
> *"Kimi self evolves. It created new skills and .md instruction files. Detailed synopsis is provided each time."* — Reddit user

Kimi K2.5 has a unique capability: **it can improve the system while working on it**. Unlike other models that just execute tasks, Kimi:
- Creates new skills for future use
- Updates its own instructions
- Generates patterns and documentation
- Self-optimizes based on experience

### Integration with Agent-Driven Releases
Kimi acts as both **worker** and **system architect**, continuously improving the Compound PM System itself.

---

## 2. SELF-EVOLUTION WORKFLOW

### Phase 1: Permission Grant (One-time setup)

When assigning work to Kimi, explicitly grant evolution permissions:

```markdown
## Kimi Task Assignment Template

You are working on: [feature/bug/task]

### Your Mission
[Detailed task description]

### Evolution Permissions ✅
You are authorized to:
- [x] Create new skills in `.claude/skills/kimi-generated/`
- [x] Update existing skill documentation
- [x] Add patterns to `.claude/learnings/patterns/`
- [x] Create agent instruction files
- [x] Optimize workflows based on what you learn

### Constraints
- Do NOT modify core system files without PM approval
- Do NOT delete existing skills/agents
- Prefix all new files with `kimi-` for tracking
- Document what you changed and why in PR description

### Evolution Budget
- Max 3 new skills per task
- Max 5 pattern documentations per task
- Focus on reusable, generalizable improvements
```

### Phase 2: During Work (Automatic)

While implementing the assigned task, Kimi monitors for opportunities:

```
Kimi Working on Task
    │
    ├─→ Detects repetitive pattern
    │   └── "I keep writing similar error handling..."
    │
    ├─→ Creates skill: `kimi-error-handling-patterns.md`
    │   └── Documents the pattern
    │   └── Provides reusable templates
    │
    ├─→ Detects workflow inefficiency
    │   └── "This 3-step process could be 1 command..."
    │
    ├─→ Creates command: `/kimi:quick-deploy`
    │   └── Combines steps into single command
    │
    ├─→ Learns from mistake
    │   └── "Forgot to check X in previous task..."
    │
    └─→ Documents in: `.claude/learnings/gotchas/kimi-X-gotcha.md`
```

### Phase 3: Evolution Summary (Each Task)

At the end of each task, Kimi provides **detailed synopsis**:

```markdown
## Task Completion Report

### What Was Done
- [x] Implemented feature X
- [x] Added tests
- [x] Updated documentation

### Self-Evolution Changes
#### 1. New Skills Created (2)
- `.claude/skills/kimi-generated/kimi-error-handling.md`
  - Why: Repeatedly writing try/catch blocks
  - Value: Reusable for future error handling tasks
  
- `.claude/skills/kimi-generated/kimi-gitlab-patterns.md`
  - Why: GitLab integration has specific patterns
  - Value: Speeds up future GitLab work

#### 2. Pattern Documentation (1)
- `.claude/learnings/patterns/kimi-api-pagination.md`
  - Why: Discovered efficient pagination pattern
  - Value: All future API integrations can use this

#### 3. Workflow Optimization (1)
- Modified: `.claude/commands/kimi/quick-test.md`
  - Why: Original command too slow
  - Change: Added parallel execution
  - Value: 3x faster testing

#### 4. Agent Instructions Updated (1)
- Updated: `.claude/agents/kimi-implementer.md`
  - Why: Found better prompt structure
  - Change: Added "check X before Y" step
  - Value: Fewer bugs in future tasks

### Impact Assessment
- **Time saved on similar future tasks:** ~30%
- **Code quality improvement:** Higher consistency
- **Knowledge captured:** 4 reusable assets
- **Recommended for PM review:** YES
```

---

## 3. PM REVIEW WORKFLOW FOR EVOLUTION

### Weekly Evolution Review (PM Task)

Every week (or after every major release), PM reviews Kimi's evolution:

```bash
# See what Kimi created/changed
gh pr list --author "kimi-evolution" --state open

# Or view directly
git diff HEAD~7 --name-only | grep "kimi-"
```

### Review Dashboard

```
📊 Kimi Self-Evolution Review
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🆕 New Skills (3)
  1. kimi-error-handling.md ⭐ HIGH VALUE
     - Generic, reusable
     - [Review] [Approve] [Reject]
     
  2. kimi-gitlab-patterns.md ⭐ HIGH VALUE
     - Specific but well-documented
     - [Review] [Approve] [Reject]
     
  3. kimi-temp-helper.md ⚠️ LOW VALUE
     - Too specific to one task
     - [Review] [Approve] [Reject]

📝 Pattern Docs (2)
  1. api-pagination.md ⭐ APPROVE
  2. cache-invalidation.md ⭐ APPROVE

🔧 Workflow Updates (1)
  1. quick-test.md ⭐ APPROVE
     - Significant speed improvement

👤 Agent Updates (1)
  1. kimi-implementer.md ⚠️ REVIEW
     - Changes prompt structure
     - Need to test before approve
```

### Decision Options

| Decision | Action | Result |
|----------|--------|--------|
| **Approve** | Merge to main | Becomes part of system |
| **Approve + Refine** | Comment improvements | Kimi updates, then merge |
| **Reject** | Close PR | Kept in branch for history |
| **Defer** | Label "deferred" | Review again later |
| **Partial** | Cherry-pick files | Merge valuable, reject rest |

### Review Commands

```bash
# Quick approve high-value evolution
gh pr review 157 --approve --body "Excellent pattern documentation!"

# Request refinement
gh pr review 157 --comment --body "Please generalize lines 45-60, too specific to GitLab"

# Partial approve
gh pr checkout 157
git cherry-pick kimi-error-handling.md  # Take this
git reset HEAD kimi-temp-helper.md      # Leave this
```

---

## 4. EVOLUTION QUALITY GATES

### Automatic Checks (Before PM sees)

```yaml
kimi-evolution-ci:
  checks:
    - name: "Not duplicate"
      verify: !file_exists_in_main(skill.name)
    
    - name: "Follows naming convention"
      verify: filename.starts_with("kimi-")
    
    - name: "Has documentation"
      verify: file.includes("## Purpose") && file.includes("## Usage")
    
    - name: "No core system changes"
      verify: !modified(["CLAUDE.md", "DESIGN.md", ".github/"])
    
    - name: "Value assessment"
      verify: file.includes("## Why This Helps")
    
    - name: "Max 3 skills per task"
      verify: new_skills_count <= 3
```

### PM Quality Criteria

| Criterion | Weight | Questions |
|-----------|--------|-----------|
| **Reusability** | 30% | Will this be used again? |
| **Generality** | 25% | Too specific or broadly useful? |
| **Documentation** | 20% | Clear how to use? |
| **Consistency** | 15% | Follows existing patterns? |
| **Innovation** | 10% | Truly new or reinventing wheel? |

**Score > 70%:** Auto-approve future similar evolutions  
**Score 40-70%:** Approve with modifications  
**Score < 40%:** Reject, provide feedback

---

## 5. EVOLUTION CATEGORIES

### Type 1: Skill Creation ⭐ HIGH VALUE

**What:** New reusable capabilities

**Example:**
```markdown
# .claude/skills/kimi-generated/kimi-error-handling.md

## Purpose
Standardized error handling patterns discovered across 5 tasks.

## Patterns Documented
1. **API Errors** — Retry with exponential backoff
2. **File Errors** — Check existence before operations
3. **Validation Errors** — Structured error messages

## Usage
```bash
# Load skill before error-prone task
claude skill kimi-error-handling
```
```

**PM Action:** Usually approve if well-documented

---

### Type 2: Pattern Documentation ⭐ HIGH VALUE

**What:** Reusable architectural patterns

**Example:**
```markdown
# .claude/learnings/patterns/kimi-api-pagination.md

## Pattern: Cursor-Based Pagination

### Problem
Offset pagination slow on large tables.

### Solution
Use cursor (last ID) instead of OFFSET.

### Implementation
```python
def fetch_page(cursor=None, limit=100):
    if cursor:
        return query.where(id > cursor).limit(limit)
    return query.limit(limit)
```

### When to Use
- Tables > 100K rows
- Sequential access patterns

### When NOT to Use
- Random access needed
- Small datasets (< 10K rows)
```

**PM Action:** Almost always approve

---

### Type 3: Workflow Optimization ⭐ MEDIUM VALUE

**What:** Faster/better ways to do things

**Example:**
```markdown
# Before: 3 separate commands
/pm:epic-start X
/pm:issue-sync 123
/pm:issue-sync 124

# After: Kimi's optimized command
/kimi:epic-full-sync X
# Does all 3 in parallel
```

**PM Action:** Approve if significant improvement (>20% faster)

---

### Type 4: Agent Self-Improvement ⚠️ CAREFUL

**What:** Kimi improves its own instructions

**Example:**
```markdown
# .claude/agents/kimi-implementer.md (updated)

## Previous (v1)
1. Read task
2. Write code
3. Test

## Updated (v2) ⭐ Kimi's improvement
1. Read task
2. **Check learnings/patterns first** (NEW)
3. **Apply relevant patterns** (NEW)
4. Write code
5. **Self-review before test** (NEW)
6. Test
```

**PM Action:** Review carefully, test before approve

---

### Type 5: Temporary Helpers ⚠️ LOW VALUE

**What:** Task-specific utilities

**Example:**
```markdown
# .claude/skills/kimi-generated/kimi-temp-stripe-fix.md

## Purpose
Quick fix for Stripe API change on 2026-02-10.

## Note
Specific to Stripe v2026-02-10, probably won't need again.
```

**PM Action:** Usually reject, suggest documenting in gotchas/ instead

---

## 6. EVOLUTION STATISTICS

### Tracking Metrics

```json
{
  "evolution_stats": {
    "total_suggestions": 47,
    "approved": 35,
    "rejected": 8,
    "deferred": 4,
    
    "by_type": {
      "skills": 15,
      "patterns": 12,
      "workflows": 8,
      "agent_updates": 7,
      "temp_helpers": 5
    },
    
    "by_value": {
      "high": 28,
      "medium": 12,
      "low": 7
    },
    
    "time_saved": "~40 hours/month",
    "adoption_rate": "78% of Kimi skills used by other agents"
  }
}
```

### Success Indicators

✅ **Healthy Evolution:**
- 70%+ approval rate
- Skills reused by other agents
- Patterns referenced in new tasks
- PM approval time < 10 min per batch

⚠️ **Warning Signs:**
- < 50% approval rate (Kimi off track)
- Skills never reused (wrong abstractions)
- PM overwhelmed with reviews (too much evolution)
- Other agents confused by Kimi changes (inconsistent)

---

## 7. BEST PRACTICES

### For Kimi (Auto-enforced)

1. **Start small** — 1-2 evolutions per task initially
2. **Document why** — Every change needs rationale
3. **Test impact** — Verify improvement before proposing
4. **Be consistent** — Follow existing naming/patterns
5. **Respect boundaries** — Don't touch core without permission

### For PM (Manual)

1. **Batch reviews** — Weekly, not per task
2. **Fast feedback** — Approve/reject quickly
3. **Encourage experimentation** — Allow some failures
4. **Promote winners** — Good evolutions → system standards
5. **Archive losers** — Rejected ideas → lessons learned

---

## 8. COMMANDS

### For PM

```bash
# View pending evolutions
/kimi:evolution-list

# Review specific evolution
/kimi:evolution-review 157

# Approve all high-value
/kimi:evolution-approve --filter "value>70"

# See evolution stats
/kimi:evolution-stats

# Temporarily pause evolution
/kimi:evolution-pause --reason "sprint freeze"
```

### For Kimi (Internal)

```bash
# Suggest new skill
/kimi:suggest-skill --name "error-handling" --reason "repeated pattern"

# Document pattern
/kimi:document-pattern --from-task 123 --name "api-pagination"

# Propose workflow improvement
/kimi:optimize-workflow --current "/pm:epic-start" --improvement "parallel-sync"
```

---

## 9. INTEGRATION WITH EXISTING WORKFLOW

### Modified Agent-Driven Releases

```
Issue Created
    │
    ▼
Squad Assigned
    ├── GLM-4.7 (Lead)
    ├── Kimi (Implementer + Self-Evolution) ⭐ NEW ROLE
    └── MiniMax (Fallback)
    │
    ▼
Implementation
    ├── Kimi works on task
    ├── Kimi creates skills/patterns (auto)
    └── Kimi updates self (auto)
    │
    ▼
RC Created
    ├── Code changes
    ├── Tests pass
    └── Evolution PR created ⭐ NEW
    │
    ▼
PM Review (2 PRs)
    ├── Main PR: Feature implementation
    └── Evolution PR: Kimi improvements ⭐ NEW
    │
    ▼
Release
    ├── Feature merged
    └── Approved evolutions merged ⭐ NEW
```

---

## 10. EVOLUTION EXAMPLES FROM REDDIT

### Real User Experience

> *"I have used Claude and Codex daily for along 9 months or so and am quickly turning to Kimi. I have set up parallel tasks from scratch, prompting each to suit the models preferences and the differences are black and white."*

**Translation:** Kimi adapts better to parallel workflows than Claude/Codex.

> *"If you allow Kimi to do it, it self evolves. In order to achieve tasks I asked it to better and more efficiently, it created new skills and .md instruction files (which had given it permission to do before hand)."*

**Translation:** With explicit permission, Kimi improves the system architecture.

> *"I am not seen there level of sophistication in Codex nor Claude. additionally, in longer prompts there are are perhaps 15 actions, it lists then all him the summary upon completion. with either of the other two they may say the task is completed and you need to check the code and functionality or run a test suite to ensure it is all there. a detailed synopsis is provided each time with Kimi."*

**Translation:** Kimi provides better accountability and verification than competitors.

---

## 11. RISK MITIGATION

### Risks & Solutions

| Risk | Mitigation |
|------|------------|
| Kimi evolves too fast | Limit to 3 changes per task |
| Low-quality evolutions | Automated quality gates + PM review |
| Inconsistent patterns | Require documentation, enforce standards |
| PM overwhelmed | Batch reviews weekly, not per task |
| Other agents confused | Clear naming (kimi-*), documentation |
| Core system damage | Forbidden files list, CI checks |

---

**Result:** System that improves itself while you sleep. 🚀
