import { describe, expect, it } from "vitest";

import {
  DUNGEON_CONTENT_GENERATOR,
  buildDungeonContentPrompt,
  dungeonContentOutputSchema,
  dungeonContentToSpec,
  dungeonContentTypeValues,
  type DungeonContentContext,
} from "@/server/ai/generators/dungeon-content";

function ctx(over: Partial<DungeonContentContext> = {}): DungeonContentContext {
  return {
    campaignName: "Dungeon Crawler World",
    type: "BOSS",
    brief: "A floor-3 boss themed around betrayal.",
    ...over,
  };
}

describe("buildDungeonContentPrompt", () => {
  it("frames the task with the kind, brief, and per-kind guidance; marks framing cacheable", () => {
    const { system, messages } = buildDungeonContentPrompt(ctx());
    expect(system[0].cache).toBe(true);
    expect(system[0].text).toMatch(/Dungeon Crawler Carl/i);
    const user = messages[0].content;
    expect(user).toContain("A floor-3 boss themed around betrayal.");
    // Per-kind framing orients the model on what a boss is.
    expect(user).toMatch(/floor boss/i);
    expect(user).toMatch(/signature gimmick/i);
  });

  it("uses the requested kind's guidance for a System message", () => {
    const { messages } = buildDungeonContentPrompt(ctx({ type: "SYSTEM_MESSAGE" }));
    expect(messages[0].content).toMatch(/System announcement/i);
  });

  it("includes the style guide as a cacheable block when present", () => {
    const { system } = buildDungeonContentPrompt(ctx({ styleGuide: "Keep it gritty." }));
    const guide = system.find((b) => b.text.includes("Keep it gritty."));
    expect(guide).toBeDefined();
    expect(guide?.cache).toBe(true);
  });

  it("omits a blank style guide", () => {
    const { system } = buildDungeonContentPrompt(ctx({ styleGuide: "   " }));
    expect(system).toHaveLength(1);
  });

  it("injects the persona voice block (cacheable) with a no-reveal rule when a persona is supplied", () => {
    const { system } = buildDungeonContentPrompt(
      ctx({ personaPrompt: "System AI persona: Petty God\nSecret agendas: undermine Borant." }),
    );
    const persona = system.find((b) => b.text.includes("Petty God"));
    expect(persona).toBeDefined();
    expect(persona?.cache).toBe(true);
    expect(persona?.text).toMatch(/System AI's current voice/i);
    expect(persona?.text).toMatch(/never state them|do not reveal/i);
  });

  it("omits the persona block when no persona is supplied (graceful, un-flavored)", () => {
    const { system } = buildDungeonContentPrompt(ctx({ personaPrompt: null }));
    expect(system.some((b) => b.text.includes("current voice"))).toBe(false);
  });

  it("offers related canon as read-only reference and existing tags for reuse", () => {
    const { messages } = buildDungeonContentPrompt(
      ctx({
        relatedCanon: [
          { type: "FLOOR", name: "The Betrayer's Gallery", summary: "Floor of broken oaths." },
          { type: "NPC", name: "Quasit", summary: null },
        ],
        campaignTags: ["floor-3", "betrayal"],
      }),
    );
    const user = messages[0].content;
    expect(user).toMatch(/Related canon/i);
    expect(user).toContain("The Betrayer's Gallery: Floor of broken oaths.");
    // Missing summary falls back to a placeholder rather than leaking nothing.
    expect(user).toContain("Quasit: (no summary yet)");
    expect(user).toContain("Existing campaign tags to prefer: floor-3, betrayal");
  });

  it("omits the related-canon and tags blocks when there are none", () => {
    const { messages } = buildDungeonContentPrompt(ctx());
    const user = messages[0].content;
    expect(user).not.toMatch(/Related canon/i);
    expect(user).not.toContain("Existing campaign tags");
  });
});

describe("dungeonContentToSpec", () => {
  it("normalizes the output, trimming fields and tags", () => {
    const spec = dungeonContentToSpec({
      name: "  The Maitre D'  ",
      summary: "  A boss who serves betrayal.  ",
      description: "  ## The Maitre D'\nHe seats you at the wrong table.  ",
      tags: [" Boss ", "boss", "floor-3"],
    });
    expect(spec).toEqual({
      name: "The Maitre D'",
      summary: "A boss who serves betrayal.",
      description: "## The Maitre D'\nHe seats you at the wrong table.",
      tags: ["Boss", "floor-3"],
    });
  });

  it("returns null when the name, summary, or description is effectively blank", () => {
    expect(
      dungeonContentToSpec({ name: "   ", summary: "s", description: "d", tags: [] }),
    ).toBeNull();
    expect(
      dungeonContentToSpec({ name: "n", summary: "   ", description: "d", tags: [] }),
    ).toBeNull();
    expect(
      dungeonContentToSpec({ name: "n", summary: "s", description: "   ", tags: [] }),
    ).toBeNull();
  });
});

describe("dungeonContentOutputSchema", () => {
  it("accepts a valid payload and defaults missing tags to []", () => {
    const parsed = dungeonContentOutputSchema.safeParse({
      name: "The Maitre D'",
      summary: "A boss.",
      description: "He seats you at the wrong table.",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.tags).toEqual([]);
  });

  it("rejects empty required fields and unknown extra keys", () => {
    expect(
      dungeonContentOutputSchema.safeParse({ name: "", summary: "s", description: "d" }).success,
    ).toBe(false);
    expect(
      dungeonContentOutputSchema.safeParse({
        name: "n",
        summary: "s",
        description: "d",
        extra: "nope",
      }).success,
    ).toBe(false);
  });
});

describe("dungeonContentTypeValues", () => {
  it("is exactly the persona-voiced creatable kinds", () => {
    expect(dungeonContentTypeValues).toEqual([
      "BOSS",
      "MOB_TYPE",
      "ITEM",
      "SYSTEM_MESSAGE",
      "ACHIEVEMENT",
      "TITLE",
    ]);
  });
});

describe("DUNGEON_CONTENT_GENERATOR", () => {
  it("has a stable id + version for provenance", () => {
    expect(DUNGEON_CONTENT_GENERATOR.id).toBe("dungeon-content");
    expect(DUNGEON_CONTENT_GENERATOR.version).toBe("1");
  });
});
