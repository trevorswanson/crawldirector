import { describe, expect, it } from "vitest";

import {
  SCAFFOLD_STUBS_GENERATOR,
  buildScaffoldStubsPrompt,
  scaffoldStubsOutputSchema,
  scaffoldStubsToSpecs,
  scaffoldableTypeValues,
  type ScaffoldStubsContext,
} from "@/server/ai/generators/scaffold-stubs";

function ctx(over: Partial<ScaffoldStubsContext> = {}): ScaffoldStubsContext {
  return {
    campaignName: "Dungeon Crawler World",
    instruction: "The shopkeepers and stalls of the Bone Market.",
    ...over,
  };
}

describe("buildScaffoldStubsPrompt", () => {
  it("frames the task with the instruction and marks framing cacheable", () => {
    const { system, messages } = buildScaffoldStubsPrompt(ctx());
    expect(system[0].cache).toBe(true);
    expect(system[0].text).toMatch(/Dungeon Crawler Carl/i);
    const user = messages[0].content;
    expect(user).toContain("The shopkeepers and stalls of the Bone Market.");
    // Lists the allowed types but never offers CRAWLER for bulk scaffolding.
    expect(user).toContain("NPC:");
    expect(user).not.toMatch(/^CRAWLER:/m);
  });

  it("includes the style guide as a cacheable block when present", () => {
    const { system } = buildScaffoldStubsPrompt(ctx({ styleGuide: "Keep it gritty." }));
    const guide = system.find((b) => b.text.includes("Keep it gritty."));
    expect(guide).toBeDefined();
    expect(guide?.cache).toBe(true);
  });

  it("omits a blank style guide", () => {
    const { system } = buildScaffoldStubsPrompt(ctx({ styleGuide: "   " }));
    expect(system).toHaveLength(1);
  });

  it("lists existing names to avoid and offers existing tags for reuse", () => {
    const { messages } = buildScaffoldStubsPrompt(
      ctx({ existingNames: ["Mordecai", "Donut"], campaignTags: ["floor-9", "boss"] }),
    );
    const user = messages[0].content;
    expect(user).toMatch(/do NOT propose duplicates/i);
    expect(user).toContain("Mordecai, Donut");
    expect(user).toContain("Existing campaign tags to prefer: floor-9, boss");
  });

  it("omits the existing-names and tags blocks when there are none", () => {
    const { messages } = buildScaffoldStubsPrompt(ctx());
    const user = messages[0].content;
    expect(user).not.toMatch(/do NOT propose duplicates/i);
    expect(user).not.toContain("Existing campaign tags");
  });
});

describe("scaffoldStubsToSpecs", () => {
  it("normalizes stubs into specs, trimming names/summaries and tags", () => {
    const specs = scaffoldStubsToSpecs(ctx(), {
      stubs: [
        { type: "NPC", name: "  Grimm the Tailor  ", summary: "  Sews cursed cloaks.  ", tags: [" Vendor ", "vendor"] },
        { type: "LOCATION", name: "Rag & Bone Stall", summary: undefined, tags: [] },
      ],
    });
    expect(specs).toEqual([
      { type: "NPC", name: "Grimm the Tailor", summary: "Sews cursed cloaks.", tags: ["Vendor"] },
      { type: "LOCATION", name: "Rag & Bone Stall", summary: null, tags: [] },
    ]);
  });

  it("drops blank names", () => {
    const specs = scaffoldStubsToSpecs(ctx(), {
      stubs: [{ type: "NPC", name: "   ", summary: "x", tags: [] }],
    });
    expect(specs).toHaveLength(0);
  });

  it("drops names that duplicate an existing entity (case-insensitive)", () => {
    const specs = scaffoldStubsToSpecs(ctx({ existingNames: ["Mordecai"] }), {
      stubs: [
        { type: "NPC", name: "mordecai", summary: "dup", tags: [] },
        { type: "NPC", name: "Fresh One", summary: "ok", tags: [] },
      ],
    });
    expect(specs.map((s) => s.name)).toEqual(["Fresh One"]);
  });

  it("drops within-batch duplicate names (keeps the first)", () => {
    const specs = scaffoldStubsToSpecs(ctx(), {
      stubs: [
        { type: "NPC", name: "Twin", summary: "first", tags: [] },
        { type: "BOSS", name: "TWIN", summary: "second", tags: [] },
      ],
    });
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ name: "Twin", summary: "first" });
  });

  it("returns an empty array when nothing usable remains", () => {
    expect(scaffoldStubsToSpecs(ctx(), { stubs: [] })).toEqual([]);
  });
});

describe("scaffoldStubsOutputSchema", () => {
  it("accepts a valid payload and defaults missing tags to []", () => {
    const parsed = scaffoldStubsOutputSchema.safeParse({
      stubs: [{ type: "NPC", name: "Grimm" }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.stubs[0].tags).toEqual([]);
  });

  it("rejects CRAWLER and unknown types", () => {
    expect(
      scaffoldStubsOutputSchema.safeParse({ stubs: [{ type: "CRAWLER", name: "Carl" }] }).success,
    ).toBe(false);
    expect(
      scaffoldStubsOutputSchema.safeParse({ stubs: [{ type: "DRAGON", name: "X" }] }).success,
    ).toBe(false);
  });

  it("rejects an empty name and caps the batch size", () => {
    expect(
      scaffoldStubsOutputSchema.safeParse({ stubs: [{ type: "NPC", name: "" }] }).success,
    ).toBe(false);
    const stubs = Array.from({ length: 21 }, (_, i) => ({ type: "NPC" as const, name: `N${i}` }));
    expect(scaffoldStubsOutputSchema.safeParse({ stubs }).success).toBe(false);
  });
});

describe("scaffoldableTypeValues", () => {
  it("excludes CRAWLER", () => {
    expect(scaffoldableTypeValues).not.toContain("CRAWLER");
    expect(scaffoldableTypeValues).toContain("NPC");
  });
});

describe("SCAFFOLD_STUBS_GENERATOR", () => {
  it("has a stable id + version for provenance", () => {
    expect(SCAFFOLD_STUBS_GENERATOR.id).toBe("scaffold-stubs");
    expect(SCAFFOLD_STUBS_GENERATOR.version).toBe("2");
  });
});
