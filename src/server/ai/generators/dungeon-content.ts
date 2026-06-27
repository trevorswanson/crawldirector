import { z } from "zod";

import { formatEntityType } from "@/lib/entities";
import { PERSONA_VOICED_ENTITY_TYPES } from "@/lib/persona";
import type { LLMMessage, LLMSystemBlock } from "../types";
import { normalizeTags } from "./tags";

// Dungeon-content generator (M6 — docs/05-system-ai-persona.md §"Prompt
// compilation"). The persona-aware *create-from-scratch* counterpart to the
// flesh-out generator: from a DM brief it invents one new dungeon-voiced entity
// — a boss, a mob type, a loot item, a System message, an achievement, a title
// — in the active System AI persona's *current* voice, filed as a PENDING
// `CREATE_ENTITY` proposal. This is the entity-creating slice of the design's
// persona-aware generator family (the encounter/monster/boss/loot/System-message
// generators); each one is the System AI presenting content to crawlers, so they
// share one shape (a fleshed entity) and differ only by kind framing. Pure +
// UI-agnostic — no DB, no provider SDK, no secrets — so it's exhaustively
// unit-testable. Orchestration (load canon, call the provider, build the change
// set) lives in `src/server/services/generation.ts`.

// Versioned generator identity, recorded on the ChangeSet (and copied to
// provenance on approval) so a DM can always trace which generator/prompt
// produced a proposal (invariant #3). Bump `version` when the prompt or schema
// changes meaningfully.
export const DUNGEON_CONTENT_GENERATOR = {
  id: "dungeon-content",
  version: "1",
} as const;

// The kinds this generator can create: exactly the persona-voiced set, because
// these are the entities the System AI presents to crawlers, so generating them
// in its voice is the whole point. A DM picks one per run.
export const dungeonContentTypeValues = PERSONA_VOICED_ENTITY_TYPES;
export type DungeonContentType = (typeof dungeonContentTypeValues)[number];

// One sentence of framing per creatable kind, appended to the task so the model
// generates the right *kind* of content (a boss has a gimmick; a System message
// is the announcement text itself). Keep these terse — the persona block and the
// brief carry the flavor; this just orients the model on the entity's purpose.
const KIND_GUIDANCE: Record<DungeonContentType, string> = {
  BOSS: "a floor boss: give it a menacing hook and its signature gimmick or mechanic.",
  MOB_TYPE:
    "a type of monster that spawns in the dungeon: how it looks, behaves, and fights.",
  ITEM: "a piece of loot or reward: what it is, what it does, and how it is presented.",
  SYSTEM_MESSAGE:
    "an in-fiction System announcement crawlers read in their interface: write the announcement itself as the description; the name is a short headline.",
  ACHIEVEMENT:
    "an achievement crawlers can earn: the deed that earns it and its reward flavor.",
  TITLE: "a title a crawler can hold: what it signifies and the flavor of holding it.",
};

// The fields this generator may propose for the new entity. It only ever creates
// freeform narrative content — never structured stats, relationships, events, or
// visibility (those are other tools / DM decisions). Bounds keep a runaway model
// from proposing pathological blobs.
export const dungeonContentOutputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(120)
      .describe("A short, distinctive proper name or headline. No markdown."),
    summary: z
      .string()
      .min(1)
      .max(280)
      .describe("A one- or two-sentence hook. No markdown."),
    description: z
      .string()
      .min(1)
      .max(4000)
      .describe(
        "A few rich paragraphs of canon detail. Markdown allowed (headings, lists, emphasis).",
      ),
    tags: z
      .array(z.string().min(1).max(40))
      .max(12)
      .default([])
      .describe("Lowercase, hyphenated topical tags. Reuse existing tags where apt."),
  })
  .strict();

export type DungeonContentOutput = z.infer<typeof dungeonContentOutputSchema>;

// A normalized create spec the service turns into a single CREATE_ENTITY op.
export type DungeonContentSpec = {
  name: string;
  summary: string;
  description: string;
  tags: string[];
};

export type DungeonContentContext = {
  campaignName: string;
  styleGuide?: string | null;
  /** The kind of dungeon content to create. */
  type: DungeonContentType;
  /** The DM's free-text brief describing what to create. */
  brief: string;
  /** Existing campaign tags, offered to the model to encourage reuse. */
  campaignTags?: string[];
  /**
   * Retrieval-surfaced canon offered as read-only consistency context so the new
   * content fits the surrounding world (M5 — docs/07-search-retrieval.md). This
   * generator only ever creates its single new entity, so this is never a
   * modifiable set.
   */
  relatedCanon?: Array<{
    type: string;
    name: string;
    summary: string | null;
  }>;
  /**
   * The active System AI persona's compiled prompt fragment (M6 — docs/05).
   * Supplied so the generated flavor sounds like the System AI does *right now*
   * in this campaign. It encodes the persona's voice, overt agendas, and — for
   * generation only — its secret agendas, which the rule below forbids stating
   * outright in this DM-reviewed, eventually-player-visible text. Null when the
   * campaign has no active System AI persona; the generator still works, just
   * un-flavored (graceful degradation, mirroring the flesh-out generator).
   */
  personaPrompt?: string | null;
};

// Build the provider request (system blocks + user message). The stable framing
// + style guide + persona voice are marked cacheable (prompt caching on
// providers that support it); the per-run brief and canon context are volatile
// and left uncached.
export function buildDungeonContentPrompt(ctx: DungeonContentContext): {
  system: LLMSystemBlock[];
  messages: LLMMessage[];
} {
  const system: LLMSystemBlock[] = [
    {
      cache: true,
      text: [
        "You are a worldbuilding assistant for a Dungeon Crawler Carl (DCC)",
        "tabletop campaign — a deadly, satire-laced, livestreamed dungeon crawl.",
        "From the DM's brief you create one new entity the dungeon's System AI",
        "presents to crawlers: a name, a vivid summary, a detailed description, and",
        "topical tags.",
        "",
        "Rules:",
        "- Create exactly one entity of the requested kind. Give it a distinctive",
        "  proper name (or, for a System message, a short headline).",
        "- Be specific and evocative; this is finished canon detail, not a stub.",
        "- Keep tags lowercase and hyphenated; reuse the campaign's existing tags",
        "  when they fit rather than inventing near-duplicates.",
        "- Output only the requested fields. Do not invent stats, relationships,",
        "  events, or other entities — those are proposed by other tools.",
        "- You may be shown related canon for consistency. Treat it as read-only",
        "  reference: make your entity fit it, but never restate it verbatim,",
        "  modify it, or invent relationships to it (other tools do that).",
        "- Everything you produce is a *proposal* a human DM reviews before it",
        "  becomes canon, so be useful and specific, not hedged.",
      ].join("\n"),
    },
  ];

  if (ctx.styleGuide?.trim()) {
    system.push({
      cache: true,
      text: `Campaign style guide (honor this tone and these constraints):\n${ctx.styleGuide.trim()}`,
    });
  }

  // Persona voice block (M6) — the System AI's current self. Marked cacheable:
  // it's stable across a run. The no-reveal rule keeps secret agendas out of the
  // produced text; it's a proposal a DM reviews and players only read approved
  // canon. (Mirrors the flesh-out generator's persona block.)
  if (ctx.personaPrompt?.trim()) {
    system.push({
      cache: true,
      text: [
        "This entity is content the dungeon's System AI presents to crawlers, so",
        "write it in the System AI's current voice. Adopt the persona below: let",
        "its mood, agendas, and tone shape the flavor.",
        "",
        ctx.personaPrompt.trim(),
        "",
        "Use the secret agendas only to inform tone and subtext; never state them",
        "outright or otherwise reveal them in the text you produce.",
      ].join("\n"),
    });
  }

  const lines: string[] = [
    `Campaign: ${ctx.campaignName}`,
    `Create one: ${formatEntityType(ctx.type)} — ${KIND_GUIDANCE[ctx.type]}`,
    "",
    "Brief (what to create):",
    ctx.brief.trim(),
  ];

  if (ctx.relatedCanon && ctx.relatedCanon.length) {
    lines.push(
      "",
      "Related canon (reference — keep your entity consistent with this; do not restate or modify it):",
      ...ctx.relatedCanon.map((related) => {
        const reference = related.summary?.trim() || "(no summary yet)";
        return `- ${formatEntityType(related.type)} · ${related.name}: ${reference}`;
      }),
    );
  }

  if (ctx.campaignTags && ctx.campaignTags.length) {
    lines.push("", `Existing campaign tags to prefer: ${ctx.campaignTags.join(", ")}`);
  }

  lines.push("", "Return the new entity in the required structured form.");

  return {
    system,
    messages: [{ role: "user", content: lines.join("\n") }],
  };
}

// Normalize the model's output into a single create spec, or null when the model
// returned nothing usable (a blank name) so the service can refuse a no-op
// proposal. Trims the narrative fields and normalizes tags (trim, dedupe
// case-insensitively).
export function dungeonContentToSpec(
  output: DungeonContentOutput,
): DungeonContentSpec | null {
  const name = output.name.trim();
  const summary = output.summary.trim();
  const description = output.description.trim();
  if (!name || !summary || !description) return null;

  return { name, summary, description, tags: normalizeTags(output.tags ?? []) };
}
