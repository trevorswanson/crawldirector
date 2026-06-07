import { z } from "zod";

import {
  isDiscouragedRelationship,
  relationshipOptionLabel,
  relationshipTypeMeta,
  type EntityTypeValue,
  type RelationshipTypeValue,
} from "@/lib/relationship-types";
import { relationshipTypeValues } from "@/lib/validation";
import type { RelationshipReviewOperationInput } from "@/server/services/review";
import type { LLMMessage, LLMSystemBlock } from "../types";

// Relationship inference generator (M4 — docs/04-ai-integration.md). It proposes
// new typed edges among already-canon entities, scoped to one target entity from
// the detail rail. The service turns these into a PENDING relationship change
// set; nothing is canon until the DM reviews it.

export const INFER_RELATIONSHIPS_GENERATOR = {
  id: "infer-relationships",
  version: "1",
} as const;

export const inferRelationshipOutputSchema = z.object({
  relationships: z
    .array(
      z.object({
        sourceEntityId: z.string().min(1),
        targetEntityId: z.string().min(1),
        type: z.enum(relationshipTypeValues),
        disposition: z.number().int().min(-100).max(100).optional(),
        notes: z.string().trim().max(1000).optional(),
        secret: z.boolean().default(false),
      }),
    )
    .max(8),
});

export type InferRelationshipOutput = z.infer<typeof inferRelationshipOutputSchema>;

export type InferRelationshipEntity = {
  id: string;
  type: string;
  name: string;
  summary: string | null;
  description?: string | null;
  tags: string[];
};

export type InferRelationshipExistingEdge = {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  type: RelationshipTypeValue;
};

export type InferRelationshipContext = {
  campaignName: string;
  styleGuide?: string | null;
  target: InferRelationshipEntity;
  candidates: InferRelationshipEntity[];
  existingRelationships: InferRelationshipExistingEdge[];
};

export function buildInferRelationshipsPrompt(ctx: InferRelationshipContext): {
  system: LLMSystemBlock[];
  messages: LLMMessage[];
} {
  const system: LLMSystemBlock[] = [
    {
      cache: true,
      text: [
        "You are a worldbuilding assistant for a Dungeon Crawler Carl (DCC)",
        "tabletop campaign. You propose typed relationships between existing",
        "canon entities so the DM can review them before they become canon.",
        "",
        "Rules:",
        "- Propose only relationships that involve the target entity.",
        "- Only use entity ids listed in the target or candidate sections.",
        "- Do not duplicate existing relationships.",
        "- Choose the direction that makes the relationship read naturally.",
        "- Prefer a small number of high-confidence, useful edges over filler.",
        "- Everything you produce is a proposal for the Review Queue, not canon.",
      ].join("\n"),
    },
  ];

  if (ctx.styleGuide?.trim()) {
    system.push({
      cache: true,
      text: `Campaign style guide (honor this tone and these constraints):\n${ctx.styleGuide.trim()}`,
    });
  }

  const lines: string[] = [
    `Campaign: ${ctx.campaignName}`,
    "",
    "Target entity:",
    entityLine(ctx.target),
    "",
    "Candidate entities:",
    ...ctx.candidates.map(entityLine),
    "",
    "Existing relationships to avoid duplicating:",
  ];

  if (ctx.existingRelationships.length) {
    lines.push(
      ...ctx.existingRelationships.map(
        (edge) =>
          `${edge.sourceId} --${edge.type}--> ${edge.targetId} (${edge.sourceName} -> ${edge.targetName})`,
      ),
    );
  } else {
    lines.push("(none)");
  }

  lines.push(
    "",
    "Allowed relationship types:",
    ...relationshipTypeValues.map((type) => `${type}: ${relationshipOptionLabel(type)}`),
    "",
    "Only use entity ids listed above. Return at most 8 relationships.",
  );

  return {
    system,
    messages: [{ role: "user", content: lines.join("\n") }],
  };
}

export function inferenceToRelationshipOperations(
  ctx: InferRelationshipContext,
  output: InferRelationshipOutput,
): RelationshipReviewOperationInput[] {
  const known = new Map<string, InferRelationshipEntity>([
    [ctx.target.id, ctx.target],
    ...ctx.candidates.map((entity) => [entity.id, entity] as const),
  ]);
  const existing = new Set(ctx.existingRelationships.flatMap(edgeKeys));
  const seen = new Set<string>();
  const operations: RelationshipReviewOperationInput[] = [];

  for (const proposed of output.relationships) {
    const source = known.get(proposed.sourceEntityId);
    const target = known.get(proposed.targetEntityId);
    if (!source || !target) continue;
    if (source.id === target.id) continue;
    if (source.id !== ctx.target.id && target.id !== ctx.target.id) continue;

    const type = proposed.type as RelationshipTypeValue;
    if (
      isDiscouragedRelationship(
        type,
        source.type as EntityTypeValue,
        target.type as EntityTypeValue,
      )
    ) {
      continue;
    }

    const key = edgeKey(source.id, target.id, type);
    const dupKeys = edgeKeys({ sourceId: source.id, targetId: target.id, type });
    if (existing.has(key) || dupKeys.some((dupKey) => seen.has(dupKey))) continue;

    seen.add(key);
    operations.push({
      op: "CREATE_RELATIONSHIP",
      patch: {
        type: { to: type },
        sourceId: { to: source.id },
        targetId: { to: target.id },
        disposition: { to: proposed.disposition ?? null },
        notes: { to: proposed.notes?.trim() || null },
        secret: { to: proposed.secret ?? false },
      },
    });
  }

  return operations;
}

function entityLine(entity: InferRelationshipEntity): string {
  const details = [
    entity.summary?.trim(),
    entity.description?.trim(),
    entity.tags.length ? `tags: ${entity.tags.join(", ")}` : null,
  ].filter(Boolean);
  return `${entity.id} | ${entity.type} | ${entity.name}${details.length ? ` | ${details.join(" | ")}` : ""}`;
}

function edgeKey(sourceId: string, targetId: string, type: RelationshipTypeValue): string {
  return `${sourceId}:${type}:${targetId}`;
}

function edgeKeys(edge: {
  sourceId: string;
  targetId: string;
  type: RelationshipTypeValue;
}): string[] {
  const keys = [edgeKey(edge.sourceId, edge.targetId, edge.type)];
  if (relationshipTypeMeta[edge.type].symmetric) {
    keys.push(edgeKey(edge.targetId, edge.sourceId, edge.type));
  }
  return keys;
}
