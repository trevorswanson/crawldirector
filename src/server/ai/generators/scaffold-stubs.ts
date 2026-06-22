import { z } from "zod";

import { formatEntityType } from "@/lib/entities";
import { entityTypeValues } from "@/lib/validation";
import type { LLMMessage, LLMSystemBlock } from "../types";
import { normalizeTags } from "./tags";

// Bulk-stub scaffolding generator (M4 — docs/04-ai-integration.md). From a DM's
// free-text instruction ("the shops and shopkeepers of the Bone Market") it
// proposes a *batch* of thin stub entities — name + type + a one-line hook +
// tags — that the service files as PENDING `CREATE_ENTITY` proposals for review.
// Stubs are intentionally minimal: the DM approves the skeleton, then fleshes
// each one out (flesh-entity generator) later. Pure + UI-agnostic — no DB, no
// provider SDK, no secrets — so it's exhaustively unit-testable. Orchestration
// (load canon, call the provider, build the change set) lives in
// `src/server/services/generation.ts`.

// Versioned generator identity, recorded on the ChangeSet (and copied to
// provenance on approval) so a DM can always trace which generator/prompt
// produced a proposal (invariant #3). Bump `version` when the prompt or schema
// changes meaningfully.
export const SCAFFOLD_STUBS_GENERATOR = {
  id: "scaffold-stubs",
  version: "2",
} as const;

// CRAWLERs (player protagonists) are created deliberately via the dedicated
// crawler form — never bulk-scaffolded — and the generic create path doesn't
// populate their satellite stats table. Everything else is fair game.
export const scaffoldableTypeValues = entityTypeValues.filter(
  (type) => type !== "CRAWLER",
) as Exclude<(typeof entityTypeValues)[number], "CRAWLER">[];

const MAX_STUBS = 20;

// The shape of one proposed stub. Deliberately minimal — name/type plus an
// optional one-line summary and topical tags. No description: that's what the
// flesh-entity generator is for. Bounds keep a runaway model from proposing a
// pathological flood of entities or blobs.
export const scaffoldStubsOutputSchema = z.object({
  stubs: z
    .array(
      z.object({
        type: z.enum(scaffoldableTypeValues),
        name: z
          .string()
          .min(1)
          .max(120)
          .describe("A short, distinctive proper name. No markdown."),
        summary: z
          .string()
          .max(280)
          .optional()
          .describe("An optional one-sentence hook. No markdown."),
        tags: z
          .array(z.string().min(1).max(40))
          .max(8)
          .default([])
          .describe("Lowercase, hyphenated topical tags. Reuse existing tags where apt."),
      }),
    )
    .max(MAX_STUBS),
});

export type ScaffoldStubsOutput = z.infer<typeof scaffoldStubsOutputSchema>;

// A normalized, deduplicated stub the service turns into a CREATE_ENTITY op.
export type StubSpec = {
  type: (typeof scaffoldableTypeValues)[number];
  name: string;
  summary: string | null;
  tags: string[];
};

export type ScaffoldStubsContext = {
  campaignName: string;
  styleGuide?: string | null;
  /** The DM's free-text instruction describing what to scaffold. */
  instruction: string;
  /** Existing entity names (any type) so the model avoids duplicates. */
  existingNames?: string[];
  /** Existing campaign tags, offered to the model to encourage reuse. */
  campaignTags?: string[];
};

// Build the provider request (system blocks + user message). The stable framing
// + style guide are marked cacheable (prompt caching where supported); the
// per-run instruction and canon context are volatile and left uncached.
export function buildScaffoldStubsPrompt(ctx: ScaffoldStubsContext): {
  system: LLMSystemBlock[];
  messages: LLMMessage[];
} {
  const system: LLMSystemBlock[] = [
    {
      cache: true,
      text: [
        "You are a worldbuilding assistant for a Dungeon Crawler Carl (DCC)",
        "tabletop campaign — a deadly, satire-laced, livestreamed dungeon crawl.",
        "From the DM's instruction you scaffold a batch of new *stub* entities:",
        "just a name, a type, and a one-line hook each. These are skeletons the",
        "DM will flesh out later, so be evocative but brief.",
        "",
        "Rules:",
        "- Each stub needs a distinctive proper name and the single most fitting",
        "  type from the allowed list.",
        "- Keep the summary to one sentence; do not write descriptions.",
        "- Keep tags lowercase and hyphenated; reuse the campaign's existing tags",
        "  when they fit rather than inventing near-duplicates.",
        "- Avoid duplicating existing entities. A bounded sample may be listed",
        "  below, and exact canon-name collisions are filtered after generation.",
        "- Propose only what the instruction asks for; prefer a focused set over",
        "  padding the list with filler.",
        "- Everything you produce is a *proposal* a human DM reviews before it",
        "  becomes canon, so be useful and specific.",
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
    "Instruction (what to scaffold):",
    ctx.instruction.trim(),
    "",
    "Allowed entity types:",
    ...scaffoldableTypeValues.map((type) => `${type}: ${formatEntityType(type)}`),
  ];

  if (ctx.existingNames && ctx.existingNames.length) {
    lines.push(
      "",
      "Existing entities sample — do NOT propose duplicates of these:",
      ctx.existingNames.join(", "),
    );
  }

  if (ctx.campaignTags && ctx.campaignTags.length) {
    lines.push("", `Existing campaign tags to prefer: ${ctx.campaignTags.join(", ")}`);
  }

  lines.push(
    "",
    `Propose up to ${MAX_STUBS} stub entities in the required structured form.`,
  );

  return {
    system,
    messages: [{ role: "user", content: lines.join("\n") }],
  };
}

// Normalize the model's output into deduplicated stub specs the service files as
// CREATE_ENTITY proposals. Drops blank names, anything whose name collides
// (case-insensitive) with an existing entity, and within-batch duplicate names;
// normalizes tags (trim, dedupe case-insensitively). Returns an empty array when
// nothing usable remains, so the service can refuse a no-op proposal.
export function scaffoldStubsToSpecs(
  ctx: ScaffoldStubsContext,
  output: ScaffoldStubsOutput,
): StubSpec[] {
  const taken = new Set((ctx.existingNames ?? []).map((n) => n.trim().toLowerCase()));
  const specs: StubSpec[] = [];

  for (const stub of output.stubs) {
    const name = stub.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);

    const summary = stub.summary?.trim() || null;
    specs.push({ type: stub.type, name, summary, tags: normalizeTags(stub.tags ?? []) });
  }

  return specs;
}
