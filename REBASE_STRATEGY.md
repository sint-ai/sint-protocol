# SINT Protocol Physical AI Governance - Rebase Strategy

**Current Situation:** Repository divergence
- **We are:** 13 commits ahead, 5 commits behind origin/main
- **Remote moved:** PR #135 (marketing), #159 (MCP registry), #160 (Show HN), #162 (docker fix), #163 (scanner), #164 (tests)
- **Our work:** Physical AI Governance implementation (13 commits, ~9,900 LOC)

---

## Situation Analysis

### Remote Changes (What Origin Has That We Don't)
1. `56a60fd` - tests: constraint-checker edge cases
2. `b73d87f` - Fix docker compose stack
3. `903ca60` - scanner: domain-verb patterns
4. `4077288` - docs(launch): Show HN draft
5. `9dff5ce` - docs: MCP Registry manifest

**Impact Assessment:**
- **Low conflict risk** - These changes are in different areas:
  - Tests (`__tests__/`)
  - Docker compose
  - Scanner patterns
  - Launch docs
  - MCP manifest
- **Our changes** are in:
  - `packages/bridge-homeassistant/`, `packages/bridge-health/`, `packages/bridge-matter/`
  - `docs/roadmaps/PHYSICAL_AI_GOVERNANCE_2026-2029.md`
  - `docs/guides/consumer-smart-home-integration.md`
  - Root documentation files (`INDEX.md`, `EXECUTION_SUMMARY.md`, etc.)
  - `packages/policy-gateway/src/plugins/delta-human.ts`
  - Extensions to `packages/bridge-iot/`, `packages/core/`

**Conflict Probability:** **LOW** (different file paths)

### Our Changes (What We Have That Origin Doesn't)
All 13 commits from Physical AI Governance implementation:
- 3 new bridge packages
- Δ_human plugin  
- Strategic roadmap
- Integration documentation
- Session reports

---

## Recommended Strategy: REBASE

**Why Rebase:**
- Creates clean linear history
- Our 13 commits sit on top of latest main
- Low conflict risk (different file paths)
- Preserves individual commit history
- Professional git workflow

**Alternative (Merge Commit):**
- Would create merge commit
- More complex history
- Acceptable but less clean

---

## Execution Plan

### Step 1: Create Safety Backup
```bash
cd /tmp/sint-protocol

# Create backup branch
git branch backup-physical-ai-governance-pre-rebase

# Verify backup
git log backup-physical-ai-governance-pre-rebase --oneline -5
```

### Step 2: Rebase Onto Latest Origin/Main
```bash
# Ensure we're on main
git checkout main

# Rebase our 13 commits onto origin/main
git rebase origin/main

# Expected: Rebase should succeed cleanly (low conflict risk)
```

### Step 3: Handle Conflicts (If Any)

**If rebase stops with conflicts:**
```bash
# Check conflict status
git status

# For each conflicted file:
# 1. Open in editor
# 2. Resolve conflicts (keep both changes where sensible)
# 3. Stage resolved file
git add <resolved-file>

# Continue rebase
git rebase --continue

# Repeat until rebase complete
```

**Common potential conflicts:**
- `package.json` (root) - unlikely but possible
- `tsconfig.json` - unlikely
- None expected in our actual code files

### Step 4: Verify Rebased History
```bash
# Check that all 13 commits are present
git log --oneline -18

# Expected order (newest first):
# - Our 13 commits (rebased, NEW HASHES)
# - 56a60fd tests: constraint-checker
# - b73d87f Fix docker compose
# - 903ca60 scanner: patterns
# - 4077288 docs: Show HN
# - 9dff5ce docs: MCP Registry
# - ... (earlier history)

# Verify our changes are intact
ls -la packages/bridge-homeassistant/
ls -la packages/bridge-health/
ls -la packages/bridge-matter/
cat INDEX.md | head -20
```

### Step 5: Push Rebased Commits
```bash
# Push to origin/main
git push origin main

# This should succeed as fast-forward
# (our 13 commits now sit cleanly on top of origin/main)
```

### Step 6: Verify on GitHub
1. Visit https://github.com/sint-ai/sint-protocol/commits/main
2. Confirm all 13 commits visible
3. Confirm new packages visible
4. Confirm documentation accessible

### Step 7: Cleanup
```bash
# After successful push and verification:
git branch -D backup-physical-ai-governance-pre-rebase

echo "✅ Rebase complete, backup removed"
```

---

## Rollback Plan (If Needed)

### If Rebase Fails Badly
```bash
# Abort rebase
git rebase --abort

# Return to backup
git reset --hard backup-physical-ai-governance-pre-rebase

# Verify we're back to pre-rebase state
git log --oneline -5
```

### Alternative: Merge Commit Strategy
```bash
# If rebase proves too complex, use merge instead:
git merge origin/main

# Resolve any conflicts
# Then:
git commit
git push origin main
```

---

## Expected Timeline

- **Step 1 (Backup):** 1 minute
- **Step 2 (Rebase):** 2-3 minutes (if no conflicts)
- **Step 3 (Conflicts):** 5-15 minutes (if conflicts occur)
- **Step 4 (Verify):** 2 minutes
- **Step 5 (Push):** 1-2 minutes
- **Step 6 (GitHub verify):** 2 minutes
- **Step 7 (Cleanup):** 1 minute

**Total:** 10-30 minutes depending on conflicts

---

## Risk Assessment

**Overall Risk:** 🟡 **MEDIUM-LOW**

**Risks:**
- ✅ Conflict risk: LOW (different file paths)
- ✅ Data loss risk: ZERO (backup branch created)
- ⚠️ Commit hash change: YES (expected with rebase)
- ✅ Functionality risk: LOW (our code unchanged)

**Mitigation:**
- Backup branch before rebase
- Can abort at any point
- Can fall back to merge commit strategy

---

## Post-Rebase Commit Hashes

**IMPORTANT:** After rebase, our 13 commits will have NEW HASHES.

**Before rebase:**
- d4afdb2, 2e28b3d, 1bfa6f9, e857927, fadb378, ... (old hashes)

**After rebase:**
- New hashes (Git will recalculate)
- Same commit content
- Same commit messages
- Just rebased onto newer base

This is **normal and expected** with rebase.

---

## Success Criteria

Rebase is successful when:
1. ✅ All 13 commits present with new hashes
2. ✅ Commits ordered correctly (ours on top of origin's 5)
3. ✅ No conflicts remaining
4. ✅ All files intact and accessible
5. ✅ Push to origin succeeds
6. ✅ GitHub shows all commits

---

## Next Steps After Successful Rebase

1. Verify CI/CD passes (if configured)
2. Update any open PRs (none expected)
3. Notify team of merge
4. Consider tagging release (e.g., v0.5.0-physical-ai)
5. Update CHANGELOG if it exists

---

**Ready to execute rebase.**

