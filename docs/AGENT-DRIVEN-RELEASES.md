# Agent-Driven Release Management
## Product Manager Workflow with Automated Agent Teams

**Version:** 1.0  
**Date:** 2026-02-15  
**Status:** Specification

---

## 1. OVERVIEW

### The Vision
> *"You are the Product Manager. Agents are your engineering team. You define what to build. They figure out how. You approve when it's done."*

### Workflow Summary
```
You (PM)                          Agents (Engineering Team)
    │                                       │
    │  1. Create GitHub Issue               │
    │     (major/minor/patch)               │
    │ ─────────────────────────────────────>│
    │                                       │
    │     2. Auto-assigned to Agent Team    │
    │     3. Work in beta branch            │
    │     4. Iterative development          │
    │     5. Self-review & fix              │
    │     6. Create RC                      │
    │     7. Full CI/CD pipeline            │
    │     8. Create PR                      │
    │                                       │
    │<──────────────────────────────────────│
    │                                       │
    │  9. You review PR                     │
    │  10. Test RC (if needed)              │
    │  11. Comment OR Approve               │
    │                                       │
    │     12. If approved → merge to main   │
    │     13. If comments → fix & repeat    │
```

---

## 2. GITHUB ISSUE STRUCTURE

### Semantic Versioning Labels

| Label | Meaning | Example |
|-------|---------|---------|
| `version:major` | Breaking changes | API redesign, architecture change |
| `version:minor` | New features | New commands, new agents |
| `version:patch` | Bug fixes | Fix typo, small improvement |
| `version:rc` | Release Candidate | Ready for testing |

### Issue Template

```markdown
---
name: Release Request
title: '[VERSION] Brief description'
labels: ['version:minor', 'status:backlog']
---

## Release Request

### Version Type
<!-- Check one -->
- [ ] major (breaking changes)
- [x] minor (new features)
- [ ] patch (bug fixes)

### Summary
One sentence description of what this release delivers.

### User Story
As a [user type], I want [feature], so that [benefit].

### Acceptance Criteria
<!-- PM defines what "done" looks like -->
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

### Non-Goals (Out of Scope)
<!-- What we WON'T do in this release -->
- Feature X (deferred to next major)
- Refactoring Y (not needed now)

### Priority
- [ ] Critical (blocks other work)
- [x] High (wanted this sprint)
- [ ] Medium (nice to have)
- [ ] Low (backlog)

### Notes
<!-- Any additional context -->
- Reference: link to related issue/PR
- Inspiration: link to external example
- Constraints: technical or business limits
```

### Example Issues

**Major Release:**
```markdown
## [MAJOR] v2.0: Multi-Provider Support

Add support for OpenAI, Anthropic, Google, and local models simultaneously.

### Acceptance Criteria
- [ ] User can configure multiple providers
- [ ] System auto-routes based on cost/quality
- [ ] Fallback chain works seamlessly
- [ ] Documentation updated
- [ ] Migration guide from v1.x

### Non-Goals
- Won't support models without API
- Won't include training/fine-tuning
```

**Minor Release:**
```markdown
## [MINOR] v1.5: GitLab Support

Add GitLab integration as alternative to GitHub.

### Acceptance Criteria
- [ ] GitLab issues sync works
- [ ] GitLab MRs created
- [ ] CI/CD via GitLab CI
- [ ] Documentation updated
```

**Patch Release:**
```markdown
## [PATCH] v1.4.2: Fix Rate Limit Cache

Fix bug where rate limit cache doesn't reset properly.

### Acceptance Criteria
- [ ] Cache resets on schedule
- [ ] No stale data after 24h
- [ ] Test added for regression
```

---

## 3. AGENT TEAM STRUCTURE

### Team Composition

Each release gets assigned an **Agent Squad**:

```
Agent Squad for Release vX.Y.Z
├── Squad Lead: Avery (Claude)
│   └── Architecture, planning, coordination
├── Quality Lead: Rex (Codex)
│   └── Code review, testing, quality gates
├── Implementation Team: MiniMax M2.5 (x5)
│   ├── Agent 1: Core functionality
│   ├── Agent 2: Tests
│   ├── Agent 3: Documentation
│   ├── Agent 4: CI/CD
│   └── Agent 5: Integration
└── DevOps: MiniMax M2.5
    └── Docker, CI/CD, deployment
```

### Responsibilities

| Role | Agent | Tasks |
|------|-------|-------|
| **Squad Lead** | Avery | Parse issue, create plan, assign work, coordinate |
| **Quality Lead** | Rex | Review code, write tests, ensure CI passes |
| **Implementers** | MiniMax x5 | Write code, docs, tests in parallel |
| **DevOps** | MiniMax | Docker, CI/CD config, deployment scripts |

---

## 4. AUTOMATED WORKFLOW

### Phase 1: Issue Triage (Auto)

**Trigger:** Issue created with `version:*` label

```
GitHub Issue Created
    │
    ▼
GitHub Actions Triggered
    │
    ▼
Agent Squad Auto-Assigned
    ├── Avery: Parse requirements
    ├── Rex: Assess complexity
    └── MiniMax: Estimate effort
    │
    ▼
Labels Updated:
    - `status:analysis`
    - `assigned-to:agent-squad`
    - `estimated-hours: X`
```

### Phase 2: Planning (Avery + Rex)

**Duration:** 10-30 minutes (depending on complexity)

```
Avery (Claude)
    │
    ├─→ Create technical plan
    ├─→ Define architecture changes
    ├─→ Identify breaking changes (if major)
    └─→ Create sub-tasks
    │
    ▼
Rex (Codex) Reviews
    │
    ├─→ Validate approach
    ├─→ Identify risks
    └─→ Suggest improvements
    │
    ▼
Iterate until "air tight"
    │
    ▼
Update Issue:
    - Add plan as comment
    - Link to architecture doc
    - Update status:planning → status:ready
```

### Phase 3: Implementation (MiniMax Team)

**Branch:** `beta/vX.Y.Z`

```
MiniMax Agents Work in Parallel
    │
    ├── Agent 1 (Core)
    │   └── Implements main functionality
    │   └── Commits: `feat: add X functionality`
    │
    ├── Agent 2 (Tests)
    │   └── Writes unit tests
    │   └── Writes integration tests
    │   └── Commits: `test: add coverage for X`
    │
    ├── Agent 3 (Docs)
    │   └── Updates README
    │   └── Updates API docs
    │   └── Commits: `docs: update for vX.Y.Z`
    │
    ├── Agent 4 (CI/CD)
    │   └── Updates GitHub Actions
    │   └── Adds new workflow steps
    │   └── Commits: `ci: add X to pipeline`
    │
    └── Agent 5 (Integration)
        └── Integration tests
        └── End-to-end tests
        └── Commits: `test: e2e tests for X`
        │
        ▼
All Agents Commit to beta/vX.Y.Z
```

### Phase 4: Self-Review (Rex + Avery)

**Before creating PR:**

```
Rex (Codex) Reviews All Changes
    │
    ├─→ Code quality check
    ├─→ Security audit
    ├─→ Performance check
    └─→ Test coverage check
    │
    ▼
If Issues Found:
    └── MiniMax fixes → Rex re-reviews
    │
    ▼
Avery (Claude) Final Review
    │
    ├─→ Architecture compliance
    ├─→ Acceptance criteria met
    └─→ Ready for PM review
    │
    ▼
Update Issue:
    - status:ready → status:rc
    - Add `version:rc` label
```

### Phase 5: CI/CD Pipeline (Automated)

**Trigger:** Push to `beta/vX.Y.Z`

```yaml
# .github/workflows/rc-pipeline.yml
name: Release Candidate Pipeline

on:
  push:
    branches:
      - 'beta/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run linter
        run: |
          npm run lint
          black --check .
          flake8 .

  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
        python-version: [3.10, 3.11]
    steps:
      - uses: actions/checkout@v4
      - name: Run unit tests
        run: |
          npm test
          pytest tests/unit

  integration-tests:
    runs-on: ubuntu-latest
    needs: [lint, unit-tests]
    steps:
      - uses: actions/checkout@v4
      - name: Run integration tests
        run: pytest tests/integration

  docker-build:
    runs-on: ubuntu-latest
    needs: [integration-tests]
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t compound-pm:rc .
      - name: Test Docker image
        run: docker run compound-pm:rc /app/scripts/test.sh

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run security scan
        run: |
          npm audit
          bandit -r src/
          safety check

  create-rc:
    runs-on: ubuntu-latest
    needs: [docker-build, security-scan]
    if: github.ref == 'refs/heads/beta/v*'
    steps:
      - uses: actions/checkout@v4
      - name: Create Release Candidate
        run: |
          VERSION=$(echo ${{ github.ref }} | sed 's/refs\/heads\/beta\///')
          echo "Creating RC for $VERSION"
          
      - name: Create PR
        uses: peter-evans/create-pull-request@v5
        with:
          title: 'Release Candidate: ${{ env.VERSION }}'
          body: |
            ## Release Candidate ${{ env.VERSION }}
            
            Automated PR created by Agent Squad.
            
            ### Changes
            - [List of changes]
            
            ### Testing
            - ✅ All unit tests pass
            - ✅ All integration tests pass
            - ✅ Docker build successful
            - ✅ Security scan clean
            - ✅ Linting clean
            
            ### Checklist for PM
            - [ ] Review code changes
            - [ ] Test functionality (if needed)
            - [ ] Check documentation
            - [ ] Approve for release
          
          branch: beta/${{ env.VERSION }}
          base: main
          labels: |
            version:rc
            status:ready-for-review
```

### Phase 6: PR Created (Ready for PM)

**PR Structure:**

```markdown
## Release Candidate: v1.5.0

**Original Issue:** #123

### What Changed
<!-- Auto-generated from commits -->
- Added GitLab integration (Agent 1)
- Updated CI/CD workflows (Agent 4)
- Added comprehensive tests (Agent 2, 5)
- Updated documentation (Agent 3)

### Test Results
| Check | Status | Details |
|-------|--------|---------|
| Unit Tests | ✅ Pass | 142/142 passed |
| Integration Tests | ✅ Pass | 28/28 passed |
| Docker Build | ✅ Pass | Image size: 245MB |
| Security Scan | ✅ Pass | 0 vulnerabilities |
| Lint | ✅ Pass | 0 errors, 0 warnings |
| Code Coverage | ✅ 94% | +3% from previous |

### Files Changed
<!-- Auto-generated -->
- `src/integrations/gitlab.py` (+240 lines)
- `tests/unit/test_gitlab.py` (+180 lines)
- `.github/workflows/ci.yml` (+45 lines)
- `docs/gitlab-integration.md` (+120 lines)

### Breaking Changes
<!-- For major versions -->
None (this is minor release)

### Migration Guide
<!-- If applicable -->
Not needed for this release.

### Agent Notes
<!-- Squad Lead comments -->
Avery: "Architecture follows established patterns. All acceptance criteria met."

Rex: "Code quality excellent. Security scan clean. Ready for PM review."

---

## PM Review Checklist
- [ ] I have reviewed the code changes
- [ ] I have tested the functionality (describe below)
- [ ] Documentation is clear and complete
- [ ] All acceptance criteria from #123 are met
- [ ] I approve this release

### PM Testing Notes
<!-- PM fills this in -->
_If you tested the RC, describe what you tested and results_

### PM Comments
<!-- Any feedback or requests -->
_If changes needed, describe here. Agents will address._
```

---

## 5. PRODUCT MANAGER WORKFLOW

### Your Dashboard

```bash
# View all releases waiting for review
gh pr list --label "version:rc" --state open
```

**Output:**
```
Showing 3 of 3 open pull requests

#156  Release Candidate: v1.5.0  [version:rc, status:ready-for-review]  2 hours ago
#155  Release Candidate: v1.4.2  [version:rc, status:ready-for-review]  1 day ago
#154  Release Candidate: v2.0.0-rc1  [version:rc, status:ready-for-review]  3 days ago
```

### Review Process

#### Option 1: Quick Approve (Trust Agents)
```bash
# If you trust the automated testing
gh pr review 156 --approve --body "LGTM! All acceptance criteria met. 🚀"
```

#### Option 2: Review with Comments
```bash
# Open PR in browser
gh pr view 156 --web

# Add comments
gh pr review 156 --comment --body "Please fix typo in docs/gitlab-integration.md line 45"
```

**Agents will:**
1. See your comment
2. Create fix commit
3. Re-run CI/CD
4. Notify you when ready

#### Option 3: Test RC Locally
```bash
# Pull the RC branch
gh pr checkout 156

# Run locally
npm run dev
# or
docker-compose up

# Test the feature
# ... your testing ...

# If good:
gh pr review 156 --approve

# If issues:
gh pr review 156 --request-changes --body "Found bug: when I do X, Y happens"
```

### Decision Matrix

| Scenario | Action |
|----------|--------|
| All good, trust agents | Approve immediately |
| Minor docs issue | Comment → agents fix → approve |
| Minor code issue | Request changes → agents fix → approve |
| Major issue | Request changes → agents replan → new RC |
| Not ready for release | Close PR, keep in beta |

---

## 6. RELEASE PROCESS

### After PM Approval

```
PM Approves PR
    │
    ▼
GitHub Actions:
    ├── Merge to main
    ├── Tag release: vX.Y.Z
    ├── Create GitHub Release
    ├── Build production Docker image
    ├── Deploy to staging (optional)
    └── Notify team
    │
    ▼
Issue #123 Updated:
    - status:released
    - closed
```

### Release Artifacts

```
vX.Y.Z Release includes:
├── Source code (tag)
├── Docker image: ghcr.io/owner/repo:vX.Y.Z
├── Release notes (auto-generated)
├── Migration guide (if major)
└── Checksum/signatures
```

---

## 7. ROLLBACK PROCESS

### If Release is Broken

```bash
# PM creates rollback issue
gh issue create --title "[ROLLBACK] v1.5.0 broken in production"
```

**Agent Squad:**
1. Creates hotfix branch from main
2. Reverts problematic changes
3. Creates new PR: v1.5.1 (patch)
4. Fast-track through CI/CD
5. PM approves emergency release

---

## 8. NOTIFICATIONS

### PM Gets Notified When:

1. **Issue Created** → You create it (obviously)
2. **Planning Complete** → Avery comments on issue
3. **RC Ready** → PR created, @mention PM
4. **CI Failed** → Agents fix, notify PM of delay
5. **Ready for Review** → Slack/email notification
6. **Deployed** → Release confirmation

### Notification Channels

```yaml
# .github/notify-config.yml
notifications:
  rc_ready:
    - slack: "#releases"
    - email: pm@company.com
    - github: @pm-username
  
  ci_failed:
    - slack: "#releases"
    - mention: @pm-username
  
  deployed:
    - slack: "#general"
    - email: team@company.com
```

---

## 9. EXAMPLE: FULL WORKFLOW

### Day 1: PM Creates Issue

**You:**
```bash
gh issue create --title "[MINOR] v1.5: Add GitLab Support" \
  --body "As a user, I want GitLab integration..." \
  --label "version:minor"
```

**Result:** Issue #123 created

---

### Day 1 (30 min later): Agents Start

**Avery (Claude):**
> "Planning complete for GitLab integration. Breaking down into 5 parallel tasks. Squad assigned."

**Rex (Codex):**
> "Plan validated. Architecture sound. No risks identified. Proceeding to implementation."

**Issue #123:**
- Label: `status:implementation`
- Comment: Link to plan

---

### Day 1-2: Implementation

**MiniMax Agents:**
- Work in parallel on `beta/v1.5.0`
- 50+ commits over 2 days
- Self-review between iterations

**You:** Can watch progress via:
```bash
gh issue view 123 --comments
# See agent updates every few hours
```

---

### Day 3: RC Ready

**GitHub Actions:**
- All tests pass ✅
- Docker builds ✅
- Security scan clean ✅
- PR #156 created ✅

**Notification:**
> 🚀 Release Candidate v1.5.0 ready for review!
> PR: #156 | Branch: beta/v1.5.0

---

### Day 3: PM Review

**You:**
```bash
gh pr checkout 156
npm test  # Optional: run tests
npm run dev  # Optional: manual testing

# If satisfied:
gh pr review 156 --approve --body "Perfect! All acceptance criteria met."
```

---

### Day 3: Released

**GitHub Actions:**
- Merges to main
- Tags v1.5.0
- Creates release
- Deploys

**Notification:**
> ✅ v1.5.0 released! Issue #123 closed.

---

## 10. SUCCESS METRICS

### For PM
- **Time from idea to release:** 2-5 days (vs 2-4 weeks traditional)
- **Review time:** 30 minutes (vs 5-10 hours traditional)
- **Rework cycles:** 0.3 average (agents get it right first time)

### For Agents
- **Issues completed per week:** 3-5 (parallel work)
- **CI pass rate:** 98% (agents fix before PR)
- **Post-release bugs:** <5% (vs 15-20% traditional)

### For Business
- **Cost per release:** $3-15 (vs $1000-5000 traditional)
- **Release velocity:** 10x faster
- **Quality:** Higher (automated testing + review)

---

## 11. COMMANDS REFERENCE

### PM Commands

```bash
# Create release request
gh issue create --title "[MINOR] vX.Y: Feature" --label "version:minor"

# View pending releases
gh pr list --label "version:rc"

# Review RC
gh pr checkout 156
gh pr review 156 --approve

# View status
gh issue list --label "status:implementation"
```

### Agent Commands (Internal)

```bash
# Start work on issue
/agents:start 123

# Update PM on progress
/agents:status 123

# Create RC
/agents:rc-create 123

# Respond to PM feedback
/agents:fix 156 --comment "Fixed typo in line 45"
```

---

**Result:** You focus on product vision. Agents handle execution. High-quality releases, faster, cheaper. 🚀
