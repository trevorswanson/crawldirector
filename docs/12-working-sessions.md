# 12 — Working Sessions Guide

This project is intended to be built over **many sessions**. This doc tells a
future session (human or AI) how to pick up the work and extend it without
drifting from the plan.

## Before you start a build session

1. **Read the plan in order** (README → 00 → … → 12). At minimum read
   [`00-overview.md`](./00-overview.md), [`03-review-pipeline.md`](./03-review-pipeline.md)
   (the invariants), and the milestone you're working on in
   [`11-roadmap.md`](./11-roadmap.md).
2. **Find the current milestone.** Check `git log`, the codebase, and
   `docs/PROGRESS.md` (create it on first build session) to see what's done.
3. **Pick the lowest-numbered unfinished milestone.** Don't skip ahead;
   dependencies are real (M2 underpins everything).

## Decompose the milestone into tasks

Take the milestone's bullets from the roadmap and break each into small,
verifiable tasks. For each task note: the files it touches, the service-layer
function(s), the migration (if any), and how you'll verify it (test or manual).
Prefer a vertical slice (schema → service → minimal UI → test) over building a
whole layer in isolation.

If a milestone is large, it's fine to land it across multiple sessions/PRs —
just keep each PR coherent and green.

## Guardrails (do not violate)

- **No canon write bypasses the review pipeline** once M2 exists. All mutations
  go through the `review` service with provenance. (See pipeline invariants.)
- **AI/imports never touch locked targets silently.**
- **UI never calls Prisma directly** — go through the service layer.
- **Player reads only via the visibility projection.** Never hand a player query
  raw canon.
- **Secrets (API keys) never reach the client, logs, or provenance.**
- **Keep `01-domain-model.md` and `09-data-schema.md` honest.** If you change the
  model, update the docs in the same PR.

## Keep the plan alive

- Maintain **`docs/PROGRESS.md`**: a running checklist of milestones/tasks done,
  with dates and PR links. Create it in M0.
- When a decision is made that future sessions must respect, record it as a short
  **ADR** in `docs/adr/NNNN-title.md` (context → decision → consequences).
- If reality diverges from a plan doc, **update the doc** rather than letting it
  rot. The plan is the shared memory across sessions.

## Verify before reporting done

- Run typecheck, lint, unit tests, and (where relevant) e2e.
- For UI work, actually run the app and exercise the flow in a browser; for the
  review pipeline and visibility projection, verify the invariants by hand *and*
  with tests.
- Don't claim a milestone is complete until its "done when" bar in the roadmap is
  met.

## Git workflow

- Develop on the designated feature branch; commit in coherent, descriptive
  chunks; push when a slice is complete.
- Don't open a PR unless asked.

## Suggested first build session (M0)

A concrete starting point so the next session isn't cold:
1. `create-next-app` (TS, App Router, Tailwind) in repo root; add shadcn/ui.
2. Add Prisma + Postgres; `schema.prisma` with `User`, `Campaign`, `Membership`;
   first migration; `docker-compose.yml` for local Postgres; `.env.example`.
3. Auth.js (credentials + one OAuth); session, sign-up/in, role helpers.
4. Service-layer skeleton + directory structure from
   [`02-architecture.md`](./02-architecture.md).
5. Minimal screens: sign in → create campaign → empty dashboard.
6. Vitest + Playwright + CI; `docs/PROGRESS.md` seeded.
7. Verify, commit, push.
