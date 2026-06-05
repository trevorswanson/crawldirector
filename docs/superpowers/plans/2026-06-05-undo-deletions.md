# Undo Deletions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let DMs immediately undo soft deletes and inspect/reopen closed Review Queue items.

**Architecture:** Add audited restore service methods that create auto-approved DM change sets from `ARCHIVED` back to `CANON`, then expose them through server actions and small undo affordances at the deletion sites. Extend the Review Queue service/page with a closed-history mode that keeps approved history read-only and rejected/superseded items reopenable.

**Tech Stack:** Next.js App Router server actions, React client components, Prisma 7, Vitest/Testing Library.

---

### Task 1: Restore Services

**Files:**
- Modify: `src/server/services/entities.ts`
- Modify: `src/server/services/relationships.ts`
- Modify: `src/server/services/events.ts`
- Test: `tests/unit/entities.test.ts`
- Test: `tests/unit/relationships.test.ts`
- Test: `tests/unit/events.test.ts`

- [ ] Add failing tests for restoring archived entities, relationships, events, and event causality links.
- [ ] Implement `restoreEntity`, `restoreRelationship`, `restoreEvent`, and `restoreEventCausality` as DM-only, auto-approved, provenance-recorded status changes.
- [ ] Re-run the focused service tests.

### Task 2: Restore Server Actions

**Files:**
- Modify: `src/app/(dm)/actions.ts`
- Test: `tests/unit/dm-actions.test.ts`

- [ ] Add failing action tests for restore calls and cache revalidation.
- [ ] Implement restore actions mirroring each archive action's affected projections.
- [ ] Re-run the focused action tests.

### Task 3: Closed Review Queue

**Files:**
- Modify: `src/server/services/review.ts`
- Modify: `src/app/(dm)/campaigns/[id]/review/page.tsx`
- Test: `tests/unit/review.test.ts`
- Test: `tests/unit/review-queue-page.test.tsx`

- [ ] Add failing tests for listing closed change sets and showing closed Review Queue rows.
- [ ] Add a closed-list service query and page `show=closed` mode.
- [ ] Keep rejected/superseded rows reopenable and approved/partially-applied rows read-only.
- [ ] Fix the unreachable `doneSummary` empty-state branch.
- [ ] Re-run the focused review tests.

### Task 4: Undo UI

**Files:**
- Modify: `src/components/entities/entity-forms.tsx`
- Modify: `src/app/(dm)/campaigns/[id]/entities/[entityId]/page.tsx`
- Modify: `src/components/entities/connections-panel.tsx`
- Modify: `src/components/entities/timeline-panel.tsx`
- Modify: `src/components/timeline/campaign-timeline.tsx`
- Test: relevant component/page tests under `tests/unit`

- [ ] Add failing component tests for immediate undo affordances.
- [ ] Wire undo notices/forms to the restore actions.
- [ ] Re-run the focused component/page tests.

### Task 5: Final Verification

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test:coverage`.
- [ ] Run `npm run build`.
- [ ] Update `docs/PROGRESS.md` with the completed slice.
