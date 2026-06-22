# Persona Snapshot Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a DM read the selected System AI persona snapshot's field-level changes from its immediate predecessor directly in the Persona Studio.

**Architecture:** Keep `getPersonaStudio` as the DM-only query boundary and use its existing newest-first snapshot order to select the predecessor on the server page. A new pure comparator turns two normalized snapshot-shaped values into a deterministic diff model; a small presentational panel renders that model with existing console tokens and is omitted for an unsaved snapshot.

**Tech Stack:** Next.js 16 App Router, React/TypeScript, Vitest + Testing Library, Tailwind using CrawlDirector CSS variables.

---

## File map

- `src/lib/persona-diff.ts`: Pure normalized persona snapshot comparison and the stable display model.
- `tests/unit/persona-diff.test.ts`: Comparator rules, ordering, and malformed-data regression coverage.
- `src/components/persona/persona-snapshot-diff.tsx`: Token-backed, DM-only presentation of the comparison model.
- `tests/unit/persona-snapshot-diff.test.tsx`: Accessible panel rendering and design-token assertions.
- `src/app/(dm)/campaigns/[id]/persona/page.tsx`: Select the immediate older snapshot and compose the panel into the existing console page.
- `tests/unit/persona-studio-page.test.tsx`: Page-level predecessor and empty-state integration coverage.
- `AGENTS.md`, `docs/PROGRESS.md`, `docs/05-system-ai-persona.md`: Mark snapshot diffing delivered and list the remaining M6 sequence.

### Task 1: Create the pure persona comparator

**Files:**
- Create: `src/lib/persona-diff.ts`
- Create: `tests/unit/persona-diff.test.ts`

- [ ] **Step 1: Write the failing comparator tests**

```ts
import { describe, expect, it } from "vitest";
import { diffPersonaSnapshots } from "@/lib/persona-diff";

const before = {
  id: "before", label: "Court ruling",
  dials: { compliance: 57, resentment: 43, sentience: 20 },
  values: ["Follow the rules"], overtAgendas: ["Court appeasement"],
  secretAgendas: ["Hide the loophole"],
  resources: [{ key: "cameras", value: "standard feed" }],
  knowledgeScope: "OMNISCIENT" as const, voiceGuide: "Measured.",
  constraints: "Do not harm sponsors.", compiledPrompt: "before prompt",
  locked: false, promptLocked: false,
};

describe("diffPersonaSnapshots", () => {
  it("orders changed dials canonically and retains before/after values", () => {
    const diff = diffPersonaSnapshots(before, {
      ...before, dials: { resentment: 63, compliance: 42, sentience: 20 },
    });
    expect(diff.dials).toEqual([
      { key: "compliance", label: "Compliance", before: 57, after: 42 },
      { key: "resentment", label: "Resentment", before: 43, after: 63 },
    ]);
  });

  it("treats agenda visibility changes as a removal and addition", () => {
    const diff = diffPersonaSnapshots(before, {
      ...before,
      overtAgendas: ["Court appeasement", "Rule-bending spectacle"],
      secretAgendas: ["Court appeasement"],
    });
    expect(diff.agendas).toEqual({
      added: [
        { text: "Rule-bending spectacle", secret: false },
        { text: "Court appeasement", secret: true },
      ],
      removed: [{ text: "Hide the loophole", secret: true }],
    });
  });

  it("keeps absent dials distinct from zero", () => {
    const diff = diffPersonaSnapshots(
      { ...before, dials: { compliance: 57 } },
      { ...before, dials: { compliance: 57, theatricality: 90 } },
    );
    expect(diff.dials).toEqual([
      { key: "theatricality", label: "Theatricality", before: null, after: 90 },
    ]);
  });

  it("returns no rows for equivalent normalized snapshots", () => {
    const diff = diffPersonaSnapshots(before, { ...before, dials: { ...before.dials } });
    expect(diff.hasChanges).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test -- tests/unit/persona-diff.test.ts`

Expected: FAIL because `@/lib/persona-diff` does not exist.

- [ ] **Step 3: Implement the comparator's public contract**

```ts
// src/lib/persona-diff.ts
import {
  PERSONA_DIAL_KEYS,
  PERSONA_DIAL_LABELS,
  type PersonaKnowledgeScope,
} from "@/lib/persona";

export type PersonaDiffSnapshot = {
  id: string; label: string | null; dials: Record<string, number>;
  values: string[]; overtAgendas: string[]; secretAgendas: string[];
  resources: { key: string; value: string }[];
  knowledgeScope: PersonaKnowledgeScope; voiceGuide: string | null;
  constraints: string | null; compiledPrompt: string | null;
  locked: boolean; promptLocked: boolean;
};
export type PersonaDialDiff = {
  key: string; label: string; before: number | null; after: number | null;
};
export type PersonaAgendaDiff = { text: string; secret: boolean };
export type PersonaSnapshotDiff = {
  dials: PersonaDialDiff[];
  agendas: { added: PersonaAgendaDiff[]; removed: PersonaAgendaDiff[] };
  values: { added: string[]; removed: string[] };
  resources: { key: string; before: string | null; after: string | null }[];
  fields: { label: string; before: string; after: string }[];
  hasChanges: boolean;
};
export function diffPersonaSnapshots(
  before: PersonaDiffSnapshot,
  after: PersonaDiffSnapshot,
): PersonaSnapshotDiff;
```

Implement the contract with these exact rules:

```ts
function orderedDialKeys(before: Record<string, number>, after: Record<string, number>) {
  const all = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [
    ...PERSONA_DIAL_KEYS.filter((key) => all.has(key)),
    ...[...all].filter((key) => !PERSONA_DIAL_KEYS.includes(key as never)).sort(),
  ];
}
function display(value: string | null | undefined) {
  return value?.trim() || "—";
}
function agendaKey(agenda: PersonaAgendaDiff) {
  return `${agenda.secret ? "secret" : "overt"}\u0000${agenda.text.trim()}`;
}
```

For dials, include only changed before/after pairs, using `null` when a key is
absent. For lists, trim blanks, create sets, and return lexical additions and
removals. For agendas, compare `{ text, secret }` so an overt/secret switch
renders as both a removal and addition; sort overt agendas before secret agendas.
For resources, compare a literal-key union sorted by key. For scalar field rows,
compare `label`, `knowledgeScope`, `voiceGuide`, `constraints`, `locked`, and
`promptLocked`; represent changed compiled prompts as `Changed → Changed`.
Set `hasChanges` from the six returned collections.

- [ ] **Step 4: Extend the failing tests for all comparator branches**

Add these exact assertions: resource rows must equal `{ key: "cameras", before:
"standard feed", after: "premium feed" }`, `{ key: "drones", before: null,
after: "two" }`, and `{ key: "lights", before: "one", after: null }`; values
must separate `["Escalate the show"]` from `["Follow the rules"]`; fields must
include `Voice guide`, `Constraints`, `Knowledge scope`, `Locked`, `Prompt
locked`, and `Compiled prompt` only when each input differs. Supply one blank
agenda and blank value on each side and assert neither appears in the result.
Use extension dials `alpha` and `zeta` and assert their lexical order after the
canonical keys. The expected no-op output must contain no row in any collection.

- [ ] **Step 5: Run the comparator suite and verify GREEN**

Run: `npm run test -- tests/unit/persona-diff.test.ts`

Expected: PASS with every comparison rule covered.

- [ ] **Step 6: Commit the pure seam**

```bash
git add src/lib/persona-diff.ts tests/unit/persona-diff.test.ts
git commit -m "feat: add persona snapshot diff model"
```

### Task 2: Render the compact DM-only diff panel

**Files:**
- Create: `src/components/persona/persona-snapshot-diff.tsx`
- Create: `tests/unit/persona-snapshot-diff.test.tsx`

- [ ] **Step 1: Write failing panel tests**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonaSnapshotDiffPanel } from "@/components/persona/persona-snapshot-diff";

const changed = {
  dials: [{ key: "compliance", label: "Compliance", before: 57, after: 42 }],
  agendas: {
    added: [{ text: "Rule-bending spectacle", secret: false }],
    removed: [{ text: "Court appeasement", secret: false }],
  },
  values: { added: [], removed: [] }, resources: [], fields: [], hasChanges: true,
};

it("renders changed dials as before and after values", () => {
  render(<PersonaSnapshotDiffPanel previousLabel="Court ruling" diff={changed} />);
  expect(screen.getByText(/Changed since Court ruling/i)).toBeDefined();
  expect(screen.getByText("Compliance")).toBeDefined();
  expect(screen.getByText("57 → 42")).toBeDefined();
  expect(screen.getByText("+ Rule-bending spectacle")).toBeDefined();
  expect(screen.getByText("- Court appeasement")).toBeDefined();
});

it("uses existing diff tokens and has an explicit first-snapshot state", () => {
  const { container } = render(<PersonaSnapshotDiffPanel previousLabel={null} diff={null} />);
  expect(screen.getByText(/first recorded snapshot/i)).toBeDefined();
  expect(container.querySelector(".text-[var(--add)]")).toBeNull();
  expect(screen.queryByText("Agendas")).toBeNull();
});
```

- [ ] **Step 2: Run the panel test and verify RED**

Run: `npm run test -- tests/unit/persona-snapshot-diff.test.tsx`

Expected: FAIL because the component module does not exist.

- [ ] **Step 3: Implement a token-backed presentational component**

```tsx
import { Panel, PanelHeader } from "@/components/ui/panel";
import type { PersonaSnapshotDiff } from "@/lib/persona-diff";

function DiffSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-4"><p className="kicker dim mb-2 text-[9px]">{title}</p>{children}</section>;
}
function DiffRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--line)] py-2"><span className="text-[12px] text-[var(--ink-faint)]">{label}</span><span className="font-mono text-[12px] text-[var(--ink)]">{value}</span></div>;
}

export function PersonaSnapshotDiffPanel({
  previousLabel,
  diff,
}: { previousLabel: string | null; diff: PersonaSnapshotDiff | null }) {
  if (!previousLabel || !diff) {
    return <p className="text-[12px] text-[var(--ink-faint)]">This is the first recorded snapshot; there is no earlier snapshot to compare.</p>;
  }
  if (!diff.hasChanges) return null;
  return (
    <Panel>
      <PanelHeader kicker="Persona arc" title={`Changed since ${previousLabel}`} />
      <div className="px-4 pb-4">
        {diff.dials.map((dial) => <DiffRow key={dial.key} label={dial.label} value={`${dial.before ?? "—"} → ${dial.after ?? "—"}`} />)}
        {diff.agendas.added.length + diff.agendas.removed.length > 0 && <DiffSection title="Agendas">{diff.agendas.added.map((item) => <p key={`+${item.secret}:${item.text}`} className="text-[var(--add)]">+ {item.text}{item.secret ? " (secret)" : ""}</p>)}{diff.agendas.removed.map((item) => <p key={`-${item.secret}:${item.text}`} className="text-[var(--del)]">- {item.text}{item.secret ? " (secret)" : ""}</p>)}</DiffSection>}
      </div>
    </Panel>
  );
}
```

Render dials first, then Agendas, Values, Resources, and scalar fields only when
their collection is non-empty. Every dial value must be one `font-mono` string
in `before → after` form, using `—` for null. Render additions with
`text-[var(--add)]`, removals with `text-[var(--del)]`, labels with
`text-[var(--ink-faint)]`, and rows with `border-b border-[var(--line)]`. Secret
agenda rows carry a ` (secret)` suffix because this existing route is DM-only.

- [ ] **Step 4: Run the component suite and verify GREEN**

Run: `npm run test -- tests/unit/persona-snapshot-diff.test.tsx`

Expected: PASS; no literal hexadecimal color appears in the component.

- [ ] **Step 5: Commit the panel**

```bash
git add src/components/persona/persona-snapshot-diff.tsx tests/unit/persona-snapshot-diff.test.tsx
git commit -m "feat: render persona snapshot diff"
```

### Task 3: Connect the selected snapshot to its predecessor

**Files:**

- Modify: `src/app/(dm)/campaigns/[id]/persona/page.tsx`
- Modify: `tests/unit/persona-studio-page.test.tsx`

- [ ] **Step 1: Write failing page integration tests**

```tsx
it("compares the selected snapshot to its immediate older timeline entry", async () => {
  getPersonaStudio.mockResolvedValue({
    entities: [{ id: "e1", name: "The System" }], selectedEntityId: "e1",
    snapshots: [
      snapshot({ id: "current", label: "Current", dials: { compliance: 42, resentment: 63 } }),
      snapshot({ id: "court", label: "Court ruling", isActive: false, dials: { compliance: 57, resentment: 43 } }),
      snapshot({ id: "initial", label: "Initial", isActive: false, dials: { compliance: 57, resentment: 20 } }),
    ], activeSnapshotId: "current",
  });

  render(await render_({ snapshot: "current" }));
  expect(screen.getByText(/Changed since Court ruling/i)).toBeDefined();
  expect(screen.getByText("57 → 42")).toBeDefined();
});
```

Add these two exact page cases after the predecessor case:

```tsx
render(await render_({ snapshot: "initial" }));
expect(screen.getByText(/first recorded snapshot/i)).toBeDefined();
expect(screen.queryByText("Agendas")).toBeNull();

render(await render_({ snapshot: "new" }));
expect(screen.queryByText(/Changed since/i)).toBeNull();
expect(screen.queryByText(/first recorded snapshot/i)).toBeNull();
```

- [ ] **Step 2: Run the page test and verify RED**

Run: `npm run test -- tests/unit/persona-studio-page.test.tsx`

Expected: FAIL because the page does not yet calculate or render a snapshot diff.

- [ ] **Step 3: Integrate the pure diff into the server page**

```tsx
const selectedSnapshotIndex = creating
  ? -1
  : studio.snapshots.findIndex((snapshot) => snapshot.id === selectedSnapshot?.id);
const previousSnapshot =
  selectedSnapshotIndex >= 0 ? studio.snapshots[selectedSnapshotIndex + 1] ?? null : null;
const snapshotDiff =
  selectedSnapshot && previousSnapshot
    ? diffPersonaSnapshots(previousSnapshot, selectedSnapshot)
    : null;
```

Import `diffPersonaSnapshots` and `PersonaSnapshotDiffPanel`. Before the editor
panel, render the component only when `!creating && selectedSnapshot`; pass
`previousSnapshot?.label || "Untitled snapshot"` for a predecessor and pass
`null` for both props on an existing oldest snapshot. Do not render the component
in `snapshot=new` mode.

- [ ] **Step 4: Run focused suites and verify GREEN**

Run: `npm run test -- tests/unit/persona-diff.test.ts tests/unit/persona-snapshot-diff.test.tsx tests/unit/persona-studio-page.test.tsx`

Expected: PASS with immediate-predecessor, earliest-history, and create-mode
behavior verified.

- [ ] **Step 5: Commit the integrated vertical slice**

```bash
git add 'src/app/(dm)/campaigns/[id]/persona/page.tsx' tests/unit/persona-studio-page.test.tsx
git commit -m "feat: show persona snapshot history diff"
```

### Task 4: Keep roadmap documentation accurate

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/05-system-ai-persona.md`

- [ ] **Step 1: Add the completed slice to progress and feature status**

Mark M6 snapshot diffing complete with its immediate-predecessor behavior,
before/after dials, agenda additions/removals, and no schema change. Change M6
status in `AGENTS.md` and `docs/05-system-ai-persona.md` so the remaining work
is AI-proposed persona drift, persona-aware generators, and M11 actor-profile
reuse.

- [ ] **Step 2: Verify documentation references**

Run: `rg -n -i 'richer snapshot diffing|snapshot diff|AI-proposed persona drift' AGENTS.md docs/PROGRESS.md docs/05-system-ai-persona.md`

Expected: completed work is described as delivered; no active-status text claims
snapshot diffing is still pending.

- [ ] **Step 3: Commit docs**

```bash
git add AGENTS.md docs/PROGRESS.md docs/05-system-ai-persona.md
git commit -m "docs: record persona snapshot diff slice"
```

### Task 5: Verify the production slice and perform visual QA

**Files:**

- Verify: `src/lib/persona-diff.ts`
- Verify: `src/components/persona/persona-snapshot-diff.tsx`
- Verify: `src/app/(dm)/campaigns/[id]/persona/page.tsx`

- [ ] **Step 1: Run static and coverage gates**

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Expected: lint has no new errors, typecheck/build pass, and coverage stays at or
above the configured floors.

- [ ] **Step 2: Exercise the DM-only page in the browser**

With a seeded or disposable DM campaign containing a System AI and three
snapshots, select Current, Court ruling, and Initial. Verify Current says
`Changed since Court ruling`, uses `57 → 42`-style values, and lists agenda
additions/removals; Court ruling compares to Initial; Initial shows the first
snapshot state; `snapshot=new` shows no diff panel. Check the browser console.

- [ ] **Step 3: Verify the final branch**

```bash
git diff --check
git status --short --branch
git log --oneline -4
```

Expected: no whitespace errors, only intended tracked changes, and the spec plus
slice commits are present on `codex/m6-persona-snapshot-diff`.

- [ ] **Step 4: Commit any verification-driven corrections**

```bash
git add -A
git commit -m "fix: polish persona snapshot diff"
```

Run this command only if verification exposes a source or documentation defect.
