import { describe, expect, it } from "vitest";

import {
  FLESH_ENTITY_GENERATOR,
  buildFleshEntityPrompt,
  fleshEntityOutputSchema,
  fleshEntityToPatch,
  patchHasChanges,
  type FleshEntityContext,
} from "@/server/ai/generators/flesh-entity";

function ctx(over: Partial<FleshEntityContext> = {}): FleshEntityContext {
  return {
    campaignName: "Dungeon Crawler World",
    entity: {
      type: "NPC",
      name: "Mordecai",
      summary: null,
      description: null,
      tags: [],
      isStub: true,
      ...over.entity,
    },
    ...over,
  };
}

describe("buildFleshEntityPrompt", () => {
  it("frames the task with the entity's current canon and marks framing cacheable", () => {
    const { system, messages } = buildFleshEntityPrompt(
      ctx({ entity: { type: "NPC", name: "Mordecai", summary: "A guide.", description: null, tags: ["ally"], isStub: false } }),
    );
    expect(system[0].cache).toBe(true);
    expect(system[0].text).toMatch(/Dungeon Crawler Carl/i);
    const user = messages[0].content;
    expect(user).toContain("Mordecai");
    expect(user).toContain("A guide.");
    expect(user).toContain("ally");
    expect(user).toContain("Currently a stub: no");
    // All writable fields are requested when nothing is locked.
    expect(user).toContain("Propose new values for: summary, description, tags.");
  });

  it("includes the style guide as a cacheable block when present", () => {
    const { system } = buildFleshEntityPrompt(ctx({ styleGuide: "Keep it gritty." }));
    const guide = system.find((b) => b.text.includes("Keep it gritty."));
    expect(guide).toBeDefined();
    expect(guide?.cache).toBe(true);
  });

  it("omits a blank style guide", () => {
    const { system } = buildFleshEntityPrompt(ctx({ styleGuide: "   " }));
    expect(system.every((b) => !b.text.includes("style guide:"))).toBe(true);
  });

  it("lists locked fields as do-not-modify and drops them from the ask", () => {
    const { messages } = buildFleshEntityPrompt(ctx({ lockedFields: ["summary"] }));
    const user = messages[0].content;
    expect(user).toMatch(/Do NOT propose changes to these locked fields.*summary/);
    expect(user).toContain("Propose new values for: description, tags.");
  });

  it("offers existing campaign tags for reuse", () => {
    const { messages } = buildFleshEntityPrompt(ctx({ campaignTags: ["floor-9", "boss"] }));
    expect(messages[0].content).toContain("Existing campaign tags to prefer: floor-9, boss");
  });

  it("lists related canon as read-only reference, and frames it as such in the system block", () => {
    const { system, messages } = buildFleshEntityPrompt(
      ctx({
        relatedCanon: [
          { type: "NPC", name: "Princess Donut", summary: "A vain talking cat.", description: null, tags: ["ally", "floor-9"] },
          { type: "FACTION", name: "Borant Syndicate", summary: null, description: null, tags: [] },
        ],
      }),
    );
    const user = messages[0].content;
    expect(user).toContain("Related canon (reference");
    expect(user).toContain("Princess Donut: A vain talking cat. [tags: ally, floor-9]");
    // A related entity with neither summary nor description renders honestly.
    expect(user).toContain("Borant Syndicate: (no summary yet)");
    // The read-only-reference rule lives in the cacheable framing.
    const systemText = system.map((b) => b.text).join("\n");
    expect(systemText).toMatch(/related canon/i);
    expect(systemText).toContain("read-only reference");
  });

  it("falls back to a bounded description excerpt when a related entity has no summary", () => {
    const { messages } = buildFleshEntityPrompt(
      ctx({
        relatedCanon: [
          {
            type: "ITEM",
            name: "Old Chronicle",
            summary: "   ",
            description: "A dusty ledger recording Mordecai's first kill on Floor 9.",
            tags: [],
          },
        ],
      }),
    );
    const user = messages[0].content;
    // Retrieval can surface an entity on a description-only fact (SearchDoc indexes
    // descriptions); that fact must reach the model, not be hidden behind a stub.
    expect(user).toContain("Old Chronicle: A dusty ledger recording Mordecai's first kill on Floor 9.");
    expect(user).not.toContain("(no summary yet)");
  });

  it("truncates a long description fallback with an ellipsis", () => {
    const { messages } = buildFleshEntityPrompt(
      ctx({
        relatedCanon: [
          { type: "NPC", name: "Verbose", summary: null, description: "x".repeat(400), tags: [] },
        ],
      }),
    );
    expect(messages[0].content).toContain(`Verbose: ${"x".repeat(300)}…`);
  });

  it("prefers a present summary over the description fallback", () => {
    const { messages } = buildFleshEntityPrompt(
      ctx({
        relatedCanon: [
          { type: "NPC", name: "Donut", summary: "A vain talking cat.", description: "SHOULD NOT APPEAR", tags: [] },
        ],
      }),
    );
    const user = messages[0].content;
    expect(user).toContain("Donut: A vain talking cat.");
    expect(user).not.toContain("SHOULD NOT APPEAR");
  });

  it("omits the related-canon section when none is provided", () => {
    const { messages } = buildFleshEntityPrompt(ctx());
    expect(messages[0].content).not.toContain("Related canon (reference");
  });

  it("injects the System AI persona as a cacheable voice block with a no-reveal rule", () => {
    const { system } = buildFleshEntityPrompt(
      ctx({
        personaPrompt:
          "System AI persona: Petty God\n\nSecret agendas for generation only; do not reveal them directly:\n- Punish Borant.",
      }),
    );
    const block = system.find((b) => b.text.includes("System AI persona: Petty God"));
    expect(block).toBeDefined();
    expect(block?.cache).toBe(true);
    expect(block?.text).toMatch(/System AI's current voice/i);
    expect(block?.text).toMatch(/never state them\s+outright/i);
  });

  it("omits the persona block when no persona prompt is supplied", () => {
    const blank = buildFleshEntityPrompt(ctx({ personaPrompt: "   " }));
    expect(blank.system.every((b) => !b.text.includes("System AI's current voice"))).toBe(
      true,
    );
    const none = buildFleshEntityPrompt(ctx());
    expect(none.system.every((b) => !b.text.includes("System AI's current voice"))).toBe(
      true,
    );
  });
});

describe("fleshEntityToPatch", () => {
  const output = { summary: "New hook.", description: "Rich detail.", tags: ["ally", "guide"] };

  it("builds a from/to patch for every changed writable field, carrying the base version", () => {
    const patch = fleshEntityToPatch(
      { version: 3, summary: null, description: "old", tags: ["ally"] },
      output,
    );
    expect(patch._baseVersion).toEqual({ to: 3 });
    expect(patch.summary).toEqual({ from: null, to: "New hook." });
    expect(patch.description).toEqual({ from: "old", to: "Rich detail." });
    expect(patch.tags).toEqual({ from: ["ally"], to: ["ally", "guide"] });
    expect(patchHasChanges(patch)).toBe(true);
  });

  it("skips fields the model left unchanged", () => {
    const patch = fleshEntityToPatch(
      { version: 1, summary: "New hook.", description: "old", tags: [] },
      { ...output, summary: "New hook." },
    );
    expect(patch.summary).toBeUndefined();
    expect(patch.description).toBeDefined();
  });

  it("treats a tag set with the same members (any case/order) as unchanged", () => {
    const patch = fleshEntityToPatch(
      { version: 1, summary: null, description: null, tags: ["Guide", "Ally"] },
      { summary: "", description: "", tags: ["ally", "guide"] },
    );
    expect(patch.tags).toBeUndefined();
  });

  it("never proposes a locked field", () => {
    const patch = fleshEntityToPatch(
      { version: 1, summary: "keep", description: null, tags: [] },
      output,
      ["summary"],
    );
    expect(patch.summary).toBeUndefined();
    expect(patch.description).toBeDefined();
  });

  it("dedupes and trims proposed tags", () => {
    const patch = fleshEntityToPatch(
      { version: 1, summary: null, description: null, tags: [] },
      { summary: "", description: "", tags: [" Ally ", "ally", "guide"] },
    );
    expect(patch.tags?.to).toEqual(["Ally", "guide"]);
  });

  it("is a no-op patch when nothing meaningful changed", () => {
    const patch = fleshEntityToPatch(
      { version: 1, summary: "same", description: "same", tags: ["a"] },
      { summary: "same", description: "same", tags: ["a"] },
    );
    expect(patchHasChanges(patch)).toBe(false);
  });

  it("ignores an empty proposed string for a field", () => {
    const patch = fleshEntityToPatch(
      { version: 1, summary: "keep", description: null, tags: [] },
      { summary: "   ", description: "new", tags: [] },
    );
    expect(patch.summary).toBeUndefined();
  });
});

describe("fleshEntityOutputSchema", () => {
  it("accepts a valid payload", () => {
    expect(
      fleshEntityOutputSchema.safeParse({ summary: "s", description: "d", tags: ["t"] }).success,
    ).toBe(true);
  });

  it("rejects an empty summary and an over-long description", () => {
    expect(fleshEntityOutputSchema.safeParse({ summary: "", description: "d", tags: [] }).success).toBe(false);
    expect(
      fleshEntityOutputSchema.safeParse({ summary: "s", description: "x".repeat(4001), tags: [] }).success,
    ).toBe(false);
  });

  it("caps the tag count", () => {
    const tags = Array.from({ length: 13 }, (_, i) => `t${i}`);
    expect(fleshEntityOutputSchema.safeParse({ summary: "s", description: "d", tags }).success).toBe(false);
  });
});

describe("FLESH_ENTITY_GENERATOR", () => {
  it("has a stable id + version for provenance", () => {
    expect(FLESH_ENTITY_GENERATOR.id).toBe("flesh-entity");
    expect(FLESH_ENTITY_GENERATOR.version).toBe("3");
  });
});
