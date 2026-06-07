---
name: branch-feature-work-from-main
description: Start new feature branches from main, not whatever branch is currently checked out
metadata:
  type: feedback
---

When starting a new slice/feature in crawldirector, create the branch from `main`
(`git checkout main && git checkout -b <name>`, or `git branch <name> main`) — not
from whatever branch happens to be checked out at session start.

**Why:** In the ADR 0008 slice-3 session the working branch was
`security/codex-scan-remediation` (2 unmerged security commits). Branching from it
meant PR #80 against main carried those unrelated security commits, which pulled
`src/server/ai/ssrf.ts` into the diff and drew an out-of-scope Codex review comment.
Fixing it required a `git rebase --onto main <security-tip>` + force-push.

**How to apply:** Before `git checkout -b`, check the current branch. If it isn't
`main` (or the intended base), branch explicitly from `main`. If a PR ends up
carrying commits it shouldn't, `git rebase --onto main <last-unwanted-commit>` drops
them, then re-run the full gate (the base changed) before force-pushing.
