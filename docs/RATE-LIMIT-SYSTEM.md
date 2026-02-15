# Rate Limit & Smart Queue System
## Cost Optimization Through Subscription-Aware Resource Management

**Version:** 1.0  
**Date:** 2026-02-15  
**Status:** Specification

---

## 1. OVERVIEW

### The Problem
Users have **fixed monthly subscriptions** (Claude Code Pro $20, Codex included) but **limited quotas**. Traditional approaches either:
- Burn through quotas quickly (expensive)
- Or wait idly when limits exceeded (slow)

### The Solution
**Smart Queue System** that:
1. **Tracks** real-time quota usage across all providers
2. **Routes** tasks to cheapest available provider
3. **Queues** non-urgent work when quotas low
4. **Falls back** to MiniMax when patience runs out

---

## 2. SUBSCRIPTION MODEL ASSUMPTIONS

### Claude Code Pro
```yaml
cost: $20/month (fixed)
soft_limit: 100 messages / 5 hours
hard_limit: 200 messages / 24 hours
reset: Rolling window
cost_if_exceeded: $0 (queue or fallback)
```

### Codex (via ChatGPT Plus or standalone)
```yaml
cost: Included in Plus ($20/month) or TBD
limit: 40 messages / 3 hours
reset: Rolling window
fallback: MiniMax for review tasks
```

### MiniMax M2.5
```yaml
cost: Pay-as-you-go
input: $0.30 / 1M tokens
output: $1.20 / 1M tokens
limit: None (credit card required)
fallback: None (always available)
```

---

## 3. RATE LIMIT TRACKER

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 RATE LIMIT TRACKER                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Claude     │  │    Codex     │  │   MiniMax    │  │
│  │   Monitor    │  │   Monitor    │  │   Monitor    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │          │
│         └─────────────────┼─────────────────┘          │
│                           │                            │
│                    ┌──────▼──────┐                     │
│                    │   Router    │                     │
│                    │   Engine    │                     │
│                    └──────┬──────┘                     │
│                           │                            │
│         ┌─────────────────┼─────────────────┐          │
│         │                 │                 │          │
│    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐     │
│    │ Execute │      │  Queue  │      │ Fallback│     │
│    │  Now   │      │  Wait   │      │ MiniMax │     │
│    └─────────┘      └─────────┘      └─────────┘     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Storage

`.claude/.cache/rate-limits.json`:
```json
{
  "claude": {
    "messages_used": 67,
    "messages_limit": 100,
    "window_reset": "2026-02-15T05:30:00Z",
    "percent_used": 67,
    "status": "healthy"
  },
  "codex": {
    "messages_used": 12,
    "messages_limit": 40,
    "window_reset": "2026-02-15T03:15:00Z",
    "percent_used": 30,
    "status": "healthy"
  },
  "minimax": {
    "tokens_used": 1250000,
    "cost_usd": 1.50,
    "status": "unlimited"
  },
  "last_updated": "2026-02-15T00:40:00Z"
}
```

### Tracking Methods

**For Claude:**
```bash
# Track via Claude Code CLI hooks
# Increment counter on each /command
# Estimate based on conversation length
```

**For Codex:**
```bash
# Track via wrapper script
# Count calls to codex CLI
# Monitor API response headers
```

**For MiniMax:**
```bash
# Track tokens via API responses
# Calculate cost from usage field
```

---

## 4. SMART QUEUE SYSTEM

### Queue Types

#### 1. Priority Queue (Hot)
```yaml
items: critical bugs, blocking issues
max_wait: 5 minutes
action_if_full: fallback to MiniMax immediately
```

#### 2. Standard Queue (Warm)
```yaml
items: feature implementation, refactoring
max_wait: 4 hours (until quota reset)
action_if_full: queue with fallback option
```

#### 3. Background Queue (Cold)
```yaml
items: documentation, learnings, patterns
max_wait: 24 hours
action_if_full: queue indefinitely
```

### Queue Storage

`.claude/.queue/`:
```
.claude/.queue/
├── hot/
│   └── task-001-urgent.json
├── warm/
│   ├── task-002-feature.json
│   └── task-003-refactor.json
└── cold/
    ├── task-004-docs.json
    └── task-005-patterns.json
```

### Queue Item Format

```json
{
  "id": "task-001",
  "type": "planning|implementation|review",
  "priority": "hot|warm|cold",
  "command": "/pm:prd-new auth-system",
  "created_at": "2026-02-15T00:30:00Z",
  "max_wait_minutes": 60,
  "fallback_allowed": true,
  "estimated_cost": {
    "claude": "$2.00",
    "minimax": "$0.50"
  }
}
```

---

## 5. ROUTING LOGIC

### Decision Matrix

| Provider | Status | Route To | Cost |
|----------|--------|----------|------|
| Claude | < 80% quota | ✅ Use Claude | $0 (subscription) |
| Claude | 80-95% quota | ⚠️ Use sparingly | $0 |
| Claude | > 95% quota | ❌ Queue or fallback | - |
| Codex | < 80% quota | ✅ Use Codex | $0 |
| Codex | > 80% quota | ❌ Use MiniMax fallback | $0.50 |
| MiniMax | Always | ✅ Always available | $0.50-1.50 |

### Routing Algorithm

```python
def route_task(task):
    limits = load_rate_limits()
    
    # Step 1: Check if primary provider available
    if task.type == "planning" and limits.claude.percent_used < 80:
        return execute_with_claude(task)
    
    if task.type == "review" and limits.codex.percent_used < 80:
        return execute_with_codex(task)
    
    # Step 2: Check if fallback allowed
    if task.fallback_allowed:
        if task.priority == "hot":
            # Hot tasks use MiniMax immediately
            return execute_with_minimax(task)
        else:
            # Others queue until quota reset
            return add_to_queue(task, provider="claude")
    
    # Step 3: Queue if no fallback
    return add_to_queue(task, provider="primary")
```

---

## 6. COMMANDS

### `/rl:status` — Check Rate Limits

```bash
claude /rl:status
```

**Output:**
```
📊 Rate Limit Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 Claude Code Pro
   Used: 67/100 messages (67%)
   Window: resets in 2h 15m
   Status: Healthy

🟢 Codex
   Used: 12/40 messages (30%)
   Window: resets in 45m
   Status: Healthy

🟢 MiniMax
   Spent: $1.50 this month
   Tokens: 1.25M
   Status: Unlimited

📋 Queue Status
   Hot: 0 pending
   Warm: 2 pending (est. 1h 30m wait)
   Cold: 3 pending
```

### `/rl:queue` — Show Queue

```bash
claude /rl:queue
```

**Output:**
```
📋 Task Queue
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 Hot (0)
   (empty)

🌡️ Warm (2)
   1. Epic: payment-system (waiting 45m)
   2. Feature: user-profile (waiting 1h 30m)

❄️ Cold (3)
   1. Docs: api-reference
   2. Pattern: error-handling
   3. Learning: auth-lessons
```

### `/rl:process` — Process Queue

```bash
claude /rl:process
```

**What it does:**
1. Checks current quotas
2. Picks highest priority task
3. Routes to available provider
4. Repeats until quota exhausted

### `/rl:force` — Force Fallback

```bash
claude /rl:force --task payment-system --provider minimax
```

**What it does:**
- Bypasses queue
- Uses MiniMax immediately
- Adds 20% cost premium for urgency

### `/rl:config` — Configure Limits

```bash
claude /rl:config --claude-limit 100 --codex-limit 40 --reset-window 5h
```

---

## 7. AUTO-ROUTING EXAMPLES

### Scenario 1: Normal Operation

**State:** Claude 30% used, Codex 20% used

**User:** `/pm:prd-new auth-system`

**System:**
1. Check quotas: Claude available
2. Route to Avery (Claude)
3. Planning complete: $0

---

### Scenario 2: Claude Quota Low

**State:** Claude 85% used, Codex 40% used

**User:** `/pm:prd-new payment-system`

**System:**
```
⚠️ Claude quota at 85% (15 messages left)

Options:
[1] Queue task (execute when quota resets in 3h)
[2] Use MiniMax fallback (+$0.30, faster)
[3] Continue with Claude (risk quota exhaustion)

Your choice: _
```

---

### Scenario 3: All Quotas Exhausted

**State:** Claude 98% used, Codex 90% used

**User:** `/pm:issue-start 1234`

**System:**
```
❌ All subscription quotas exhausted

Claude: resets in 2h 15m
Codex: resets in 45m

Options:
[1] Queue all tasks (auto-execute when available)
[2] Emergency MiniMax mode (+$1.50 per task, instant)
[3] Schedule for tonight (auto-run at 3 AM)

Your choice: _
```

---

### Scenario 4: Hot Task Emergency

**State:** Claude 95% used

**User:** `/pm:hotfix production-bug`

**System:**
```
🔥 Hot task detected: production-bug

Claude quota critical (95%), but task is urgent.
Auto-routing to MiniMax for immediate execution.

Estimated cost: $0.80 (vs $0 if waited 2h)
Time saved: 2 hours

Proceed? [Y/n]: _
```

---

## 8. COST OPTIMIZATION STRATEGIES

### Strategy 1: Time-of-Day Routing

```python
if nighttime and queue_not_empty:
    # Process all cold/warm tasks at 3 AM
    # When quotas freshly reset
    process_queue()
```

### Strategy 2: Batch Similar Tasks

```python
# Group 3 planning tasks together
# Use 1 Claude session for all 3
# Save on context-switching overhead
batch = find_similar_tasks(queue, n=3)
execute_batch_with_claude(batch)
```

### Strategy 3: Predictive Pre-warming

```python
if quota_resets_in < 30_minutes and queue_length > 5:
    # Notify user that work will resume soon
    # Or auto-start if user enabled
    send_notification("Quota resets in 25m, 5 tasks ready")
```

### Strategy 4: Smart Fallback Thresholds

```python
# Don't fallback immediately at 80%
# Reserve last 20% for hot tasks only
if quota_percent > 80 and task_priority != "hot":
    use_minimax_fallback()
elif quota_percent > 95:
    # Even hot tasks fallback
    use_minimax_fallback()
```

---

## 9. REAL-WORLD COST SCENARIOS

### Scenario A: Conservative (All Subscription)

**Usage:** 30 features/month
- Claude: 30 planning sessions (within quota)
- Codex: 30 review sessions (within quota)
- MiniMax: 0 (only if emergency)

**Cost:** $20 (Claude) + $0 (Codex) + $0 = **$20/month**

---

### Scenario B: Balanced (Occasional Fallback)

**Usage:** 30 features/month
- Claude: 25 sessions (quota on day 25)
- Codex: 28 sessions (quota on day 28)
- MiniMax: 5 emergency fallbacks

**Cost:** $20 + $0 + $3 = **$23/month**

---

### Scenario C: Heavy (Lots of Fallback)

**Usage:** 60 features/month
- Claude: 40 sessions (quota exhausted day 20)
- Codex: 45 sessions (quota exhausted day 23)
- MiniMax: 35 sessions (fallback)

**Cost:** $20 + $0 + $25 = **$45/month**

**vs Pure Claude:** $400-600/month

---

## 10. IMPLEMENTATION PLAN

### Week 1: Core Tracker
- [ ] Create rate limit tracking system
- [ ] Store usage in `.claude/.cache/`
- [ ] Add `/rl:status` command

### Week 2: Queue System
- [ ] Implement priority queues
- [ ] Add `/rl:queue` command
- [ ] Create queue persistence

### Week 3: Router
- [ ] Implement routing logic
- [ ] Add auto-fallback
- [ ] Create `/rl:process` command

### Week 4: Optimization
- [ ] Add time-of-day scheduling
- [ ] Implement batching
- [ ] Add predictive notifications

---

## 11. COMMANDS REFERENCE

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/rl:status` | Check quotas | Before big planning session |
| `/rl:queue` | View pending | See what's waiting |
| `/rl:process` | Execute queued | When quotas reset |
| `/rl:force` | Emergency | Hot bug, no time to wait |
| `/rl:config` | Settings | Change thresholds |

---

**Result:** Maximize subscription value, minimize MiniMax costs, never block on quotas. 🎯
