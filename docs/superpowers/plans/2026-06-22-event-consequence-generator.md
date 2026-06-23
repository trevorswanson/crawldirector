# Event-Consequence Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let a DM generate bounded, review-only effects and causal links for an existing canonical event, including AI-proposed System-AI persona drift.

**Architecture:** A pure event-consequence generator constrains model output to known candidate ids and converts it into event-review operations. The service loads campaign-scoped context, calls the BYO provider, records usage, and files one PENDING AI change set. APPLY_EVENT_EFFECTS accepts generated effects directly from its review patch, applying them only after approval; causal links point only at existing events, avoiding M10 operation-alias work.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Prisma/PostgreSQL, Vitest, React Testing Library, existing BYO LLM provider abstraction.

---

## File structure

- Create: src/server/ai/generators/event-consequences.ts — versioned output schema, prompt, and operation mapping.
- Create: tests/unit/event-consequences-generator.test.ts — pure prompt, schema, and mapping tests.
- Modify: src/server/services/review.ts — support patch-carried generated effects during refresh and approval.
- Create: tests/unit/event-consequence-effects.test.ts — DB-backed effect review tests.
- Modify: src/server/services/generation.ts and tests/unit/generation.test.ts — orchestration, provider handling, usage, and provenance.
- Modify: src/app/(dm)/actions.ts and tests/unit/dm-actions.test.ts — server action.
- Create: src/components/timeline/consequence-generator.tsx and tests/unit/consequence-generator.test.tsx — Timeline action state and Review Queue handoff.
- Modify: src/components/timeline/campaign-timeline.tsx, src/app/(dm)/campaigns/[id]/timeline/page.tsx, and their tests — provider-gated Timeline affordance.
- Modify: docs/04-ai-integration.md, docs/05-system-ai-persona.md, docs/11-roadmap.md, and docs/PROGRESS.md.

### Task 1: Pure structured generator

**Files:**

- Create: src/server/ai/generators/event-consequences.ts
- Test: tests/unit/event-consequences-generator.test.ts

- [ ] **Step 1: Write the failing pure-generator tests**

~~~ts
import { describe, expect, it } from "vitest";
import {
  EVENT_CONSEQUENCES_GENERATOR,
  buildEventConsequencesPrompt,
  consequenceOutputToEventOperations,
} from "@/server/ai/generators/event-consequences";

const context = {
  campaignName: "Dungeon",
  sourceEvent: {
    id: "event-origin",
    title: "Court rejects the ruling",
    summary: "The System is humiliated.",
    timePhrase: "Day 3",
  },
  effectTargets: [
    { id: "crawler-1", type: "CRAWLER", name: "Carl" },
    { id: "system-1", type: "SYSTEM_AI", name: "The System" },
  ],
  consequenceEvents: [{ id: "event-aftermath", title: "Broadcast retaliation" }],
  existingCausalEffectIds: [],
};

it("uses supplied ids and frames output as a review proposal", () => {
  const prompt = buildEventConsequencesPrompt(context);
  expect(EVENT_CONSEQUENCES_GENERATOR).toEqual({ id: "event-consequences", version: "1" });
  expect(prompt.messages[0].content).toContain("event-origin");
  expect(prompt.messages[0].content).toContain("event-aftermath");
  expect(prompt.system.map((block) => block.text).join("\n")).toMatch(/Review Queue/i);
  expect(prompt.system.map((block) => block.text).join("\n")).toMatch(/Do not invent ids/i);
});

it("maps supported effects and non-duplicate causal links into event operations", () => {
  const operations = consequenceOutputToEventOperations(context, {
    effects: [{
      kind: "PERSONA_SHIFT",
      targetEntityId: "system-1",
      dialShifts: { compliance: -15 },
      note: "The court's rejection hardens its defiance.",
    }],
    causalLinks: [{
      effectEventId: "event-aftermath",
      weight: 0.8,
      note: "The ruling motivates the broadcast.",
    }],
  }, () => "effect-ai-1");
  expect(operations).toEqual([
    {
      op: "APPLY_EVENT_EFFECTS",
      targetId: "event-origin",
      patch: {
        effects: {
          to: [expect.objectContaining({
            id: "effect-ai-1",
            kind: "PERSONA_SHIFT",
            targetEntityId: "system-1",
          })],
        },
      },
    },
    {
      op: "CREATE_EVENT_CAUSALITY",
      patch: {
        causeId: { to: "event-origin" },
        effectId: { to: "event-aftermath" },
        weight: { to: 0.8 },
        note: { to: "The ruling motivates the broadcast." },
      },
    },
  ]);
});
~~~

- [ ] **Step 2: Run the new tests and confirm the missing-module failure**

Run: npm run test -- tests/unit/event-consequences-generator.test.ts

Expected: FAIL with a module-resolution error for event-consequences.

- [ ] **Step 3: Implement the pure generator**

~~~ts
export const EVENT_CONSEQUENCES_GENERATOR = {
  id: "event-consequences",
  version: "1",
} as const;

export const eventConsequencesOutputSchema = z.object({
  effects: z.array(eventEffectSchema.omit({ id: true })).max(6),
  causalLinks: z.array(z.object({
    effectEventId: z.string().min(1),
    weight: z.number().min(0).max(1).optional(),
    note: z.string().trim().max(1000).optional(),
  })).max(4),
});

export function consequenceOutputToEventOperations(
  context: EventConsequencesContext,
  output: EventConsequencesOutput,
  nextEffectId: () => string,
): EventReviewOperationInput[] {
  const allowedTargets = new Set(context.effectTargets.map((target) => target.id));
  const allowedEvents = new Set(context.consequenceEvents.map((event) => event.id));
  const effects = output.effects
    .filter((effect) => !effect.targetEntityId || allowedTargets.has(effect.targetEntityId))
    .map((effect) => ({ ...effect, id: nextEffectId() }));
  const operations: EventReviewOperationInput[] = effects.length
    ? [{ op: "APPLY_EVENT_EFFECTS", targetId: context.sourceEvent.id, patch: { effects: { to: effects } } }]
    : [];
  for (const link of output.causalLinks) {
    if (!allowedEvents.has(link.effectEventId)) continue;
    if (context.existingCausalEffectIds.includes(link.effectEventId)) continue;
    operations.push({
      op: "CREATE_EVENT_CAUSALITY",
      patch: {
        causeId: { to: context.sourceEvent.id },
        effectId: { to: link.effectEventId },
        ...(link.weight === undefined ? {} : { weight: { to: link.weight } }),
        ...(link.note ? { note: { to: link.note } } : {}),
      },
    });
  }
  return operations;
}
~~~

Export a context type and build a prompt containing only source-event and supplied target/event candidates. Its rules require concise high-confidence proposals, only known ids, supported effect kinds, and review-only output. Use the shared event effect schema so invalid dial keys cannot reach the service.

- [ ] **Step 4: Run the pure suite and extend edge coverage**

Run: npm run test -- tests/unit/event-consequences-generator.test.ts

Expected: PASS. Add tests for unknown target ids, self/unknown/duplicate causal ids, COLLAPSE_FLOOR without a target, persona dial preservation, and output that maps to no operations.

- [ ] **Step 5: Commit the pure module**

~~~bash
git add src/server/ai/generators/event-consequences.ts tests/unit/event-consequences-generator.test.ts
git commit -m "feat: define event consequence generator"
~~~

### Task 2: Self-contained generated effect review operations

**Files:**

- Modify: src/server/services/review.ts around evaluateApplyEventEffectsOperationFlags and applyApplyEventEffects
- Create: tests/unit/event-consequence-effects.test.ts

- [ ] **Step 1: Write failing DB-backed review tests**

~~~ts
it("applies an AI effect carried only by the accepted operation patch", async () => {
  const { dm, campaign, event, crawler } = await seedEventWithCrawler();
  const changeSet = await createPendingEventChangeSet(dm.id, campaign.id, {
    source: "AI",
    title: "Propose consequences for Court ruling",
    operations: [{
      op: "APPLY_EVENT_EFFECTS",
      targetId: event.id,
      patch: {
        effects: {
          to: [{
            id: "ai-gold",
            kind: "ADJUST_STAT",
            targetEntityId: crawler.id,
            stat: "gold",
            delta: 50,
          }],
        },
      },
    }],
  });
  await setChangeOperationDecision(dm.id, campaign.id, changeSet.operations[0].id, {
    decision: "ACCEPTED",
  });
  await approveChangeSet(dm.id, campaign.id, changeSet.id);
  expect((await prisma.crawler.findUniqueOrThrow({ where: { entityId: crawler.id } })).gold).toBe(50);
  expect(readStoredEffects(event.id)).toEqual([
    expect.objectContaining({ id: "ai-gold", applied: true, reviewStatus: "APPLIED" }),
  ]);
});

it("rejects a generated patch-carried effect without adding event history", async () => {
  const { dm, campaign, event, crawler } = await seedEventWithCrawler();
  const changeSet = await createPendingEventChangeSet(dm.id, campaign.id, {
    source: "AI",
    title: "Propose consequences",
    operations: [{
      op: "APPLY_EVENT_EFFECTS",
      targetId: event.id,
      patch: {
        effects: {
          to: [{ id: "ai-nope", kind: "SET_ALIVE", targetEntityId: crawler.id, value: false }],
        },
      },
    }],
  });
  await rejectChangeSet(dm.id, campaign.id, changeSet.id);
  expect(readStoredEffects(event.id)).not.toContainEqual(expect.objectContaining({ id: "ai-nope" }));
});
~~~

- [ ] **Step 2: Run the DB-backed test and confirm patch-only effects are stale**

Run: npm run test -- tests/unit/event-consequence-effects.test.ts

Expected: FAIL because evaluateApplyEventEffectsOperationFlags treats the new effect id as missing from Event.effects.

- [ ] **Step 3: Implement patch-only effect handling**

In evaluateApplyEventEffectsOperationFlags, retain stale behavior for an existing effect that is applied, belongs to another pending operation, or has vanished. For an effect in the effective patch but absent from stored effects, validate it and run existing crawler/persona live-target and lock checks without treating newness as staleness.

In applyApplyEventEffects, merge a patch-only effect into local stored effects only inside the approval transaction:

~~~ts
const proposed = reviewedEffects.filter((effect) => !storedById.has(effect.id));
for (const effect of proposed) {
  const stored: StoredEventEffect = {
    ...effect,
    applied: false,
    appliedChangeSetId: null,
    pendingChangeSetId: changeSet.id,
    pendingOperationId: operationId,
    reviewStatus: "PENDING",
  };
  assertValidDeclaredEffect(stored);
  effects.push(stored);
  storedById.set(stored.id, stored);
}
~~~

Select only patch-named new effects for the existing per-kind apply loop. Reuse the established target write, lock, provenance, AFFECTED participant, and event-history serialization code. A rejection does not enter this path and therefore produces no stored generated effect. Preserve the existing DM-declared-effect behavior.

- [ ] **Step 4: Run focused review suites**

Run: npm run test -- tests/unit/event-consequence-effects.test.ts tests/unit/persona-shift-effect.test.ts tests/unit/events.test.ts

Expected: PASS. Add coverage for a patch-carried persona shift, locked crawler, locked active persona, and archived source event.

- [ ] **Step 5: Commit review behavior**

~~~bash
git add src/server/services/review.ts tests/unit/event-consequence-effects.test.ts
git commit -m "feat: review generated event effects atomically"
~~~

### Task 3: Event-consequence service orchestration

**Files:**

- Modify: src/server/services/generation.ts
- Modify: tests/unit/generation.test.ts

- [ ] **Step 1: Write failing service tests using the real test database**

~~~ts
it("files AI effects and causal links as one pending event change set", async () => {
  const { dmId, campaignId, sourceEventId, crawlerId, aftermathEventId } =
    await seedConsequences();
  resolveCampaignProvider.mockResolvedValue(fakeProvider({
    effects: [{
      kind: "ADJUST_STAT",
      targetEntityId: crawlerId,
      stat: "gold",
      delta: 50,
      note: "A televised prize.",
    }],
    causalLinks: [{
      effectEventId: aftermathEventId,
      weight: 0.8,
      note: "The ruling sparks retaliation.",
    }],
  }));
  const result = await proposeEventConsequences(dmId, campaignId, sourceEventId);
  const changeSet = await prisma.changeSet.findUniqueOrThrow({
    where: { id: result.changeSetId },
    include: { operations: true },
  });
  expect(changeSet).toMatchObject({
    status: "PENDING",
    source: "AI",
    promptId: "event-consequences",
    promptVersion: "1",
  });
  expect(changeSet.operations.map((operation) => operation.op)).toEqual([
    "APPLY_EVENT_EFFECTS",
    "CREATE_EVENT_CAUSALITY",
  ]);
});
~~~

- [ ] **Step 2: Run the service test and confirm the missing-export failure**

Run: npm run test -- tests/unit/generation.test.ts

Expected: FAIL because proposeEventConsequences is not exported.

- [ ] **Step 3: Implement the generator orchestration**

~~~ts
export type ProposeEventConsequencesResult = {
  changeSetId: string;
  providerId: string;
  model: string;
  operationCount: number;
};

export async function proposeEventConsequences(
  userId: string,
  campaignId: string,
  eventId: string,
): Promise<ProposeEventConsequencesResult> {
  await assertCampaignDm(userId, campaignId);
  return withCampaignAiLock(campaignId, () =>
    proposeEventConsequencesLocked(userId, campaignId, eventId),
  );
}
~~~

Load campaign and source event, reject missing/archived/locked sources, resolve the provider, and check spend before and after retrieval. Query searchCanon with source title plus summary and ENTITY/EVENT targets. Hydrate only canonical unlocked CRAWLER entities, canonical unlocked SYSTEM_AI entities with active persona snapshots, and canonical unlocked non-source event candidates. Prepend eligible source participants, cap and deduplicate candidates, call generateStructured with schemaName event_consequences and maxTokens 2048, and record usage before rejecting an empty mapped result. Call the pure mapper with randomUUID and file one createPendingEventChangeSet with ChangeSource.AI, provider/model/generator metadata, and a Propose consequences for title. Link the usage row to the change set.

- [ ] **Step 4: Run focused service tests and add failure-path coverage**

Run: npm run test -- tests/unit/generation.test.ts tests/unit/event-consequences-generator.test.ts

Expected: PASS. Add missing-provider, provider-failure, source-lock, post-retrieval spend-cap, invented-id, duplicate-causal, provenance, and no-preapproval-mutation assertions.

- [ ] **Step 5: Commit service orchestration**

~~~bash
git add src/server/services/generation.ts tests/unit/generation.test.ts
git commit -m "feat: propose reviewable event consequences"
~~~

### Task 4: Timeline invocation and Review Queue handoff

**Files:**

- Modify: src/app/(dm)/actions.ts
- Modify: tests/unit/dm-actions.test.ts
- Create: src/components/timeline/consequence-generator.tsx
- Create: tests/unit/consequence-generator.test.tsx
- Modify: src/components/timeline/campaign-timeline.tsx
- Modify: src/app/(dm)/campaigns/[id]/timeline/page.tsx
- Modify: tests/unit/campaign-timeline.test.tsx
- Modify: tests/unit/campaign-timeline-page.test.tsx

- [ ] **Step 1: Write failing action and component tests**

~~~tsx
it("submits an event and links the resulting proposal", async () => {
  proposeEventConsequencesAction.mockResolvedValue({
    success: "2 consequences proposed (claude).",
    changeSetId: "cs-1",
    timestamp: 1,
  });
  render(<ConsequenceGenerator campaignId="c1" eventId="ev-1" />);
  fireEvent.click(screen.getByRole("button", { name: /propose consequences/i }));
  await waitFor(() => expect(proposeEventConsequencesAction).toHaveBeenCalled());
  expect(screen.getByRole("link", { name: /open review queue/i }))
    .toHaveAttribute("href", "/campaigns/c1/review?selected=cs-1");
});

it("suppresses the Timeline affordance for no configured provider", () => {
  renderTimeline({ aiConfigured: false, events: [makeEvent("ev-1", "Locked", 1, "a1")] });
  expect(screen.queryByRole("button", { name: /propose consequences/i })).toBeNull();
});
~~~

- [ ] **Step 2: Run UI/action tests and confirm missing action and prop failures**

Run: npm run test -- tests/unit/dm-actions.test.ts tests/unit/consequence-generator.test.tsx tests/unit/campaign-timeline.test.tsx tests/unit/campaign-timeline-page.test.tsx

Expected: FAIL because the action, component, and aiConfigured Timeline prop do not exist.

- [ ] **Step 3: Implement the action, isolated component, and provider gate**

~~~ts
export async function proposeEventConsequencesAction(
  campaignId: string,
  eventId: string,
  _prev: GenerateActionState,
  _formData: FormData,
): Promise<GenerateActionState> {
  const user = await requireUser();
  try {
    const result = await proposeEventConsequences(user.id, campaignId, eventId);
    revalidatePath("/campaigns/" + campaignId + "/review");
    revalidatePath("/campaigns/" + campaignId + "/timeline");
    return {
      success: result.operationCount + " " +
        (result.operationCount === 1 ? "consequence" : "consequences") +
        " proposed (" + result.model + "). Review them in the queue.",
      changeSetId: result.changeSetId,
      timestamp: Date.now(),
    };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, timestamp: Date.now() };
    logActionError("Event consequence generation action failed", error);
    return { error: "Generation failed. Please try again.", timestamp: Date.now() };
  }
}
~~~

ConsequenceGenerator uses useActionState, useFormStatus, Sparkles, and next/link. It renders one Propose consequences submit button, uses Generating… while pending, reports errors with role alert, and renders Open Review Queue ↗ using the selected change-set query parameter.

Add aiConfigured boolean to CampaignTimeline. Render the component only when canEdit, aiConfigured, the event is unlocked, and it is not currently in edit mode. In the page, include listAiKeys(user.id, id) in Promise.all, derive aiConfigured from non-empty keys, and pass it through. Do not add a second control to the entity Timeline.

- [ ] **Step 4: Run UI/action tests and complete behavioral coverage**

Run: npm run test -- tests/unit/dm-actions.test.ts tests/unit/consequence-generator.test.tsx tests/unit/campaign-timeline.test.tsx tests/unit/campaign-timeline-page.test.tsx

Expected: PASS. Add assertions for ServiceError/generic fallback, both revalidation paths, pending state, success link, DM/co-DM and provider gates, event-lock suppression, and unchanged edit/apply controls.

- [ ] **Step 5: Commit Timeline handoff**

~~~bash
git add 'src/app/(dm)/actions.ts' src/components/timeline/consequence-generator.tsx src/components/timeline/campaign-timeline.tsx 'src/app/(dm)/campaigns/[id]/timeline/page.tsx' tests/unit/dm-actions.test.ts tests/unit/consequence-generator.test.tsx tests/unit/campaign-timeline.test.tsx tests/unit/campaign-timeline-page.test.tsx
git commit -m "feat: add timeline consequence proposal action"
~~~

### Task 5: Documentation and full verification

**Files:**

- Modify: docs/04-ai-integration.md
- Modify: docs/05-system-ai-persona.md
- Modify: docs/11-roadmap.md
- Modify: docs/PROGRESS.md
- Modify: tests/unit/review-queue-page.test.tsx

- [ ] **Step 1: Add presentation and provenance regression tests**

Add a generation.test.ts case that approves a generated PERSONA_SHIFT and proves that the new PersonaSnapshot provenance points to the AI change set. Add a review-queue-page.test.tsx case that renders Apply effects and the causality operation labels without exposing provider secrets or secret-agenda text.

- [ ] **Step 2: Run regression tests**

Run: npm run test -- tests/unit/generation.test.ts tests/unit/event-consequence-effects.test.ts tests/unit/review-queue-page.test.tsx tests/unit/persona-shift-effect.test.ts

Expected: PASS. The assertions prove that AI output stays PENDING until approval and that persona drift retains provenance.

- [ ] **Step 3: Update documentation**

In docs/04-ai-integration.md, list the live generator as bounded effects and causal links for an existing event, structured output, and PENDING-only review. In docs/05-system-ai-persona.md, state that an event can yield a pending PERSONA_SHIFT proposal that materializes only upon approval. In docs/11-roadmap.md and docs/PROGRESS.md, record the M6 slice as complete and retain the M10 boundary: same-change-set creation of a downstream event and its causal link awaits generic operation alias/dependency support. Do not change library, import, or global-admin scope.

- [ ] **Step 4: Run project gates and rendered verification**

Run:

~~~bash
set -a
. ../../.env
set +a
npm run lint
npm run typecheck
npm run build
npm run test:coverage
~~~

Expected: every command exits 0 and coverage remains at or above 95% statements, 85% branches, 95% functions, and 95% lines.

Start npm run dev, sign in as a DM with a configured provider, open Timeline, verify the control is hidden for a locked event, invoke it for an unlocked event, and confirm the success link opens a PENDING Review Queue set without applying effects.

- [ ] **Step 5: Commit docs and regression tests**

~~~bash
git add docs/04-ai-integration.md docs/05-system-ai-persona.md docs/11-roadmap.md docs/PROGRESS.md tests/unit/generation.test.ts tests/unit/review-queue-page.test.tsx
git commit -m "docs: record event consequence generator slice"
~~~

## Plan self-review

- Spec coverage: Tasks 1–3 implement strict output, retrieval-aware orchestration, usage, provenance, PENDING review, effects, causal links, and persona drift. Task 4 supplies the single Timeline entry point. Task 5 synchronizes docs and runs quality gates.
- Scope boundary: no task introduces library state, import links, global administration, autonomous cascades, ordinary relationship writes, or newly created downstream events. Same-set downstream-event links require ADR 0012 operation alias/dependency machinery.
- Type consistency: EventConsequencesOutput maps to EventReviewOperationInput[], proposeEventConsequences returns ProposeEventConsequencesResult, the action uses GenerateActionState, and the Timeline prop is consistently named aiConfigured.

