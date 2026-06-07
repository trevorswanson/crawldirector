import { describe, expect, it } from "vitest";

import {
  INFER_RELATIONSHIPS_GENERATOR,
  buildInferRelationshipsPrompt,
  inferRelationshipOutputSchema,
  inferenceToRelationshipOperations,
  type InferRelationshipContext,
} from "@/server/ai/generators/infer-relationships";

function ctx(over: Partial<InferRelationshipContext> = {}): InferRelationshipContext {
  return {
    campaignName: "Dungeon Crawler World",
    target: {
      id: "target",
      type: "NPC",
      name: "Mordecai",
      summary: "A gruff tutorial guide.",
      description: null,
      tags: ["guide"],
    },
    candidates: [
      { id: "carl", type: "CRAWLER", name: "Carl", summary: "A crawler.", tags: ["crawler"] },
      { id: "donut", type: "CRAWLER", name: "Princess Donut", summary: "A cat.", tags: ["crawler"] },
    ],
    existingRelationships: [
      {
        sourceId: "target",
        sourceName: "Mordecai",
        targetId: "carl",
        targetName: "Carl",
        type: "MENTOR_OF",
      },
    ],
    ...over,
  };
}

describe("buildInferRelationshipsPrompt", () => {
  it("frames relationship inference around one target, candidate ids, and existing edges", () => {
    const { system, messages } = buildInferRelationshipsPrompt(ctx());
    expect(system[0].cache).toBe(true);
    expect(system[0].text).toMatch(/propose typed relationships/i);
    const user = messages[0].content;
    expect(user).toContain("Target entity:");
    expect(user).toContain("target | NPC | Mordecai");
    expect(user).toContain("carl | CRAWLER | Carl");
    expect(user).toContain("target --MENTOR_OF--> carl");
    expect(user).toContain("Only use entity ids listed above");
  });

  it("includes the campaign style guide as a cacheable block when present", () => {
    const { system } = buildInferRelationshipsPrompt(ctx({ styleGuide: "Keep betrayals sharp." }));
    const guide = system.find((block) => block.text.includes("Keep betrayals sharp."));
    expect(guide).toBeDefined();
    expect(guide?.cache).toBe(true);
  });
});

describe("inferenceToRelationshipOperations", () => {
  it("turns valid inferred edges into CREATE_RELATIONSHIP operations", () => {
    const operations = inferenceToRelationshipOperations(ctx(), {
      relationships: [
        {
          sourceEntityId: "target",
          targetEntityId: "donut",
          type: "ALLY_OF",
          disposition: 65,
          notes: "They coordinate crawler survival.",
          secret: false,
        },
      ],
    });

    expect(operations).toEqual([
      {
        op: "CREATE_RELATIONSHIP",
        patch: {
          type: { to: "ALLY_OF" },
          sourceId: { to: "target" },
          targetId: { to: "donut" },
          disposition: { to: 65 },
          notes: { to: "They coordinate crawler survival." },
          secret: { to: false },
        },
      },
    ]);
  });

  it("drops unknown endpoints, self edges, duplicate existing edges, and discouraged crawler floor location edges", () => {
    const operations = inferenceToRelationshipOperations(
      ctx({
        target: { id: "carl", type: "CRAWLER", name: "Carl", summary: null, description: null, tags: [] },
        candidates: [
          { id: "floor9", type: "FLOOR", name: "Larracos", summary: null, tags: [] },
          { id: "donut", type: "CRAWLER", name: "Princess Donut", summary: null, tags: [] },
        ],
        existingRelationships: [
          {
            sourceId: "carl",
            sourceName: "Carl",
            targetId: "donut",
            targetName: "Princess Donut",
            type: "ALLY_OF",
          },
        ],
      }),
      {
        relationships: [
          { sourceEntityId: "missing", targetEntityId: "donut", type: "RIVAL_OF", secret: false },
          { sourceEntityId: "carl", targetEntityId: "carl", type: "RIVAL_OF", secret: false },
          { sourceEntityId: "carl", targetEntityId: "donut", type: "ALLY_OF", secret: false },
          { sourceEntityId: "carl", targetEntityId: "floor9", type: "LOCATED_ON", secret: false },
          { sourceEntityId: "donut", targetEntityId: "carl", type: "ENEMY_OF", secret: false },
        ],
      },
    );

    expect(operations).toHaveLength(1);
    expect(operations[0].patch.sourceId?.to).toBe("donut");
    expect(operations[0].patch.targetId?.to).toBe("carl");
  });
});

describe("inferRelationshipOutputSchema", () => {
  it("accepts bounded relationship proposals", () => {
    expect(
      inferRelationshipOutputSchema.safeParse({
        relationships: [
          { sourceEntityId: "a", targetEntityId: "b", type: "ALLY_OF", disposition: 10, secret: false },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects invalid relationship types and out-of-range disposition", () => {
    expect(
      inferRelationshipOutputSchema.safeParse({
        relationships: [{ sourceEntityId: "a", targetEntityId: "b", type: "BOGUS", secret: false }],
      }).success,
    ).toBe(false);
    expect(
      inferRelationshipOutputSchema.safeParse({
        relationships: [{ sourceEntityId: "a", targetEntityId: "b", type: "ALLY_OF", disposition: 101, secret: false }],
      }).success,
    ).toBe(false);
  });
});

describe("INFER_RELATIONSHIPS_GENERATOR", () => {
  it("has a stable id + version for provenance", () => {
    expect(INFER_RELATIONSHIPS_GENERATOR.id).toBe("infer-relationships");
    expect(INFER_RELATIONSHIPS_GENERATOR.version).toBe("1");
  });
});
