import { describe, expect, it } from "vitest";

import {
  EVENT_CONSEQUENCES_GENERATOR,
  buildEventConsequencesPrompt,
  consequenceOutputToEventOperations,
  eventConsequencesOutputSchema,
  type EventConsequencesContext,
} from "@/server/ai/generators/event-consequences";

function ctx(overrides: Partial<EventConsequencesContext> = {}): EventConsequencesContext {
  return {
    campaignName: "Dungeon Crawler World",
    sourceEvent: {
      id: "source-event",
      title: "The Iron Tangle opens",
      summary: "The floor opens beneath the crawlers.",
      timePhrase: "Day 12, Floor 3",
    },
    effectTargets: [
      { id: "carl", type: "CRAWLER", name: "Carl" },
      { id: "system", type: "SYSTEM_AI", name: "The System" },
    ],
    existingConsequenceEvents: [
      { id: "consequence-1", title: "The sponsor ratings spike" },
      { id: "consequence-2", title: "The hunters arrive" },
    ],
    existingOutgoingCausalEffectIds: ["consequence-2"],
    ...overrides,
  };
}

describe("EVENT_CONSEQUENCES_GENERATOR", () => {
  it("has a stable id and version for provenance", () => {
    expect(EVENT_CONSEQUENCES_GENERATOR).toEqual({ id: "event-consequences", version: "1" });
  });
});

describe("buildEventConsequencesPrompt", () => {
  it("frames all supplied candidates as the only writable ids and keeps related canon read-only", () => {
    const { system, messages } = buildEventConsequencesPrompt(
      ctx({
        relatedCanon: [
          {
            type: "FACTION",
            title: "The Syndicate",
            content: "They monetize crawler humiliation.",
          },
        ],
      }),
    );

    expect(system[0]).toMatchObject({ cache: true });
    expect(system[0]?.text).toMatch(/Review Queue proposal/i);
    expect(system[0]?.text).toMatch(/do not invent ids, events, or entities/i);
    expect(system[0]?.text).toMatch(/secret agendas/i);

    const user = messages[0]?.content ?? "";
    expect(user).toContain("source-event | The Iron Tangle opens");
    expect(user).toContain("Day 12, Floor 3");
    expect(user).toContain("carl | CRAWLER | Carl");
    expect(user).toContain("system | SYSTEM_AI | The System");
    expect(user).toContain("consequence-1 | The sponsor ratings spike");
    expect(user).toContain("consequence-2 | The hunters arrive");
    expect(user).toContain("The Syndicate");
    expect(user).toContain("read-only");
  });

  it("adds the campaign style guide as a cacheable system block", () => {
    const { system } = buildEventConsequencesPrompt(ctx({ styleGuide: "Keep consequences cruel." }));
    expect(system).toContainEqual({
      cache: true,
      text: expect.stringContaining("Keep consequences cruel."),
    });
  });
});

describe("eventConsequencesOutputSchema", () => {
  it("accepts bounded built-in crawler and persona effects", () => {
    expect(
      eventConsequencesOutputSchema.safeParse({
        effects: [
          {
            kind: "ADJUST_STAT",
            targetEntityId: "carl",
            stat: "gold",
            delta: 25,
            note: "Loot payouts rise.",
          },
          {
            kind: "PERSONA_SHIFT",
            targetEntityId: "system",
            dialShifts: { resentment: 15, compliance: -10 },
          },
        ],
        causalLinks: [{ effectEventId: "consequence-1", weight: 0.8, note: "Ratings react." }],
      }).success,
    ).toBe(true);
  });

  it("rejects effect and causal-link values outside the bounded supported shapes", () => {
    expect(
      eventConsequencesOutputSchema.safeParse({
        effects: Array.from({ length: 7 }, () => ({ kind: "COLLAPSE_FLOOR" })),
        causalLinks: [],
      }).success,
    ).toBe(false);
    expect(
      eventConsequencesOutputSchema.safeParse({
        effects: [],
        causalLinks: Array.from({ length: 5 }, () => ({ effectEventId: "consequence-1" })),
      }).success,
    ).toBe(false);
    expect(
      eventConsequencesOutputSchema.safeParse({
        effects: [
          {
            kind: "PERSONA_SHIFT",
            targetEntityId: "system",
            dialShifts: { charisma: 10 },
          },
        ],
        causalLinks: [],
      }).success,
    ).toBe(false);
    expect(
      eventConsequencesOutputSchema.safeParse({
        effects: [
          { kind: "PERSONA_SHIFT", targetEntityId: "system", dialShifts: { resentment: 0 } },
        ],
        causalLinks: [],
      }).success,
    ).toBe(false);
    expect(
      eventConsequencesOutputSchema.safeParse({
        effects: [{ kind: "COLLAPSE_FLOOR", id: "model-id" }],
        causalLinks: [],
      }).success,
    ).toBe(false);
    expect(
      eventConsequencesOutputSchema.safeParse({
        effects: [],
        causalLinks: [{ effectEventId: "consequence-1", weight: 1.1 }],
      }).success,
    ).toBe(false);
  });
});

describe("consequenceOutputToEventOperations", () => {
  it("maps valid crawler and persona effects into one source-event effect operation", () => {
    const ids = ["effect-1", "effect-2"];
    const operations = consequenceOutputToEventOperations(
      ctx(),
      {
        effects: [
          { kind: "SET_ALIVE", targetEntityId: "carl", value: false },
          {
            kind: "PERSONA_SHIFT",
            targetEntityId: "system",
            dialShifts: { theatricality: 20 },
          },
        ],
        causalLinks: [],
      },
      () => ids.shift()!,
    );

    expect(operations).toEqual([
      {
        op: "APPLY_EVENT_EFFECTS",
        targetId: "source-event",
        patch: {
          effects: {
            to: [
              { id: "effect-1", kind: "SET_ALIVE", targetEntityId: "carl", value: false },
              {
                id: "effect-2",
                kind: "PERSONA_SHIFT",
                targetEntityId: "system",
                dialShifts: { theatricality: 20 },
              },
            ],
          },
        },
      },
    ]);
  });

  it("drops unsupported targets while permitting a targetless floor collapse", () => {
    const operations = consequenceOutputToEventOperations(
      ctx(),
      {
        effects: [
          { kind: "ADJUST_STAT", targetEntityId: "not-offered", stat: "gold", delta: 10 },
          { kind: "COLLAPSE_FLOOR" },
        ],
        causalLinks: [],
      },
      () => "collapse-id",
    );

    expect(operations).toEqual([
      {
        op: "APPLY_EVENT_EFFECTS",
        targetId: "source-event",
        patch: { effects: { to: [{ id: "collapse-id", kind: "COLLAPSE_FLOOR" }] } },
      },
    ]);
  });

  it("filters unknown, self, duplicate, and existing causal links in output order", () => {
    const operations = consequenceOutputToEventOperations(
      ctx(),
      {
        effects: [],
        causalLinks: [
          { effectEventId: "missing" },
          { effectEventId: "source-event" },
          { effectEventId: "consequence-2" },
          { effectEventId: "consequence-1", weight: 0.6, note: "First useful link." },
          { effectEventId: "consequence-1", weight: 0.5 },
        ],
      },
      () => "unused",
    );

    expect(operations).toEqual([
      {
        op: "CREATE_EVENT_CAUSALITY",
        patch: {
          causeId: { to: "source-event" },
          effectId: { to: "consequence-1" },
          weight: { to: 0.6 },
          note: { to: "First useful link." },
        },
      },
    ]);
  });

  it("returns no operations when every output item is unusable", () => {
    expect(
      consequenceOutputToEventOperations(
        ctx(),
        {
          effects: [{ kind: "SET_ALIVE", targetEntityId: "not-offered", value: true }],
          causalLinks: [{ effectEventId: "missing" }],
        },
        () => "unused",
      ),
    ).toEqual([]);
  });
});
