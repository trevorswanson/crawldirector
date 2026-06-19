import { z } from "zod";

import { formatEntityType } from "@/lib/entities";
import type { ReviewPatch } from "@/server/services/review";
import type { LLMMessage, LLMSystemBlock } from "../types";

// Entity-fleshing generator (M4 — docs/04-ai-integration.md). The first
// generator: it expands a stub (or thin) entity into a fuller summary +
// description + tags, returned as structured output the service turns into a
// PENDING `UPDATE_ENTITY` proposal. Pure + UI-agnostic — no DB, no provider SDK,
// no secrets — so it's exhaustively unit-testable. The orchestration (load
// canon, call the provider, build the change set) lives in
// `src/server/services/generation.ts`.

// Versioned generator identity, recorded on the ChangeSet (and copied to
// provenance on approval) so a DM can always trace which generator/prompt
// produced a proposal (invariant #3). Bump `version` when the prompt or schema
// changes meaningfully.
export const FLESH_ENTITY_GENERATOR = {
  id: "flesh-entity",
  // v2 (M5 slice 6): the prompt now offers retrieval-surfaced related canon as
  // read-only reference context, with a rule framing how to use it.
  // v3 (M6 slice 2): persona-aware — for dungeon-voiced entity kinds the active
  // System AI persona is injected as a voice/agenda system block (docs/05).
  version: "3",
} as const;

// The fields this generator may propose. Deliberately limited to the freeform
// narrative fields — it never touches structured stats, locks, visibility, or
// relationships. Bounds keep a runaway model from proposing pathological blobs.
export const fleshEntityOutputSchema = z.object({
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
    .describe("Lowercase, hyphenated topical tags. Reuse existing tags where apt."),
});

export type FleshEntityOutput = z.infer<typeof fleshEntityOutputSchema>;

// Which of this generator's writable fields are off-limits because the DM locked
// them. Locked fields are shown to the model as read-only reference and dropped
// from the proposed patch entirely (invariant #2 — AI never modifies locked
// targets; the pipeline's blocked-flag is a backstop).
export type FleshableField = "summary" | "description" | "tags";

export type FleshEntityContext = {
  campaignName: string;
  styleGuide?: string | null;
  entity: {
    type: string;
    name: string;
    summary: string | null;
    description: string | null;
    tags: string[];
    isStub: boolean;
  };
  /** Existing campaign tags, offered to the model to encourage reuse. */
  campaignTags?: string[];
  /**
   * Other canon entities surfaced by retrieval as the *relevant* slice of the
   * world (M5 slice 6 — docs/07-search-retrieval.md §"Retrieval-augmented
   * context"). Shown as read-only reference so the model's additions stay
   * consistent with surrounding canon; this generator only ever proposes against
   * its target, so this is never a modifiable set.
   */
  relatedCanon?: Array<{
    type: string;
    name: string;
    summary: string | null;
    description: string | null;
    tags: string[];
  }>;
  /** Fields the DM has locked — excluded from the proposal. */
  lockedFields?: FleshableField[];
  /**
   * The active System AI persona's compiled prompt fragment (M6 — docs/05).
   * Supplied only for dungeon-voiced entity kinds (bosses, mobs, loot, System
   * messages, …) so the generated flavor sounds like the System AI does *right
   * now* in this campaign. It encodes the persona's voice, overt agendas, and —
   * for generation only — its secret agendas, which the rule below forbids
   * stating outright in this DM-reviewed, eventually-player-visible text.
   */
  personaPrompt?: string | null;
};

const FLESHABLE_FIELDS: FleshableField[] = ["summary", "description", "tags"];

function writableFields(locked: FleshableField[] | undefined): FleshableField[] {
  const lockedSet = new Set(locked ?? []);
  return FLESHABLE_FIELDS.filter((f) => !lockedSet.has(f));
}

// Cap the related-canon reference excerpt. Summaries are already ≤ 280 chars
// (schema), but retrieval matches against the doc's full content (incl.
// description), so an entity can be surfaced for a description-only fact. When it
// has no summary, fall back to a bounded slice of the description so that fact
// still reaches the model instead of being withheld behind "(no summary yet)".
const RELATED_REFERENCE_MAX = 300;

function relatedReference(related: {
  summary: string | null;
  description: string | null;
}): string {
  const summary = related.summary?.trim();
  if (summary) return summary;
  const description = related.description?.trim();
  if (!description) return "(no summary yet)";
  return description.length > RELATED_REFERENCE_MAX
    ? `${description.slice(0, RELATED_REFERENCE_MAX).trimEnd()}…`
    : description;
}

// Build the provider request (system blocks + user message). The stable framing
// + style guide are marked cacheable (prompt caching on providers that support
// it); the per-entity content is volatile and left uncached.
export function buildFleshEntityPrompt(ctx: FleshEntityContext): {
  system: LLMSystemBlock[];
  messages: LLMMessage[];
} {
  const writable = writableFields(ctx.lockedFields);
  const locked = ctx.lockedFields ?? [];

  const system: LLMSystemBlock[] = [
    {
      cache: true,
      text: [
        "You are a worldbuilding assistant for a Dungeon Crawler Carl (DCC)",
        "tabletop campaign — a deadly, satire-laced, livestreamed dungeon crawl.",
        "You flesh out an existing entity into richer canon: a vivid summary, a",
        "detailed description, and topical tags.",
        "",
        "Rules:",
        "- Stay consistent with the entity's existing name, type, and any details",
        "  already present. Expand and enrich; never contradict established canon.",
        "- Keep tags lowercase and hyphenated; reuse the campaign's existing tags",
        "  when they fit rather than inventing near-duplicates.",
        "- Output only the requested fields. Do not invent stats, relationships,",
        "  or events — those are proposed by other tools.",
        "- You may be shown related canon (other entities) for consistency. Treat it",
        "  as read-only reference: make your additions fit it, but never restate it",
        "  verbatim, modify it, or invent relationships to it (other tools do that).",
        "- Everything you produce is a *proposal* a human DM reviews before it",
        "  becomes canon, so be useful and specific, not hedged.",
      ].join("\n"),
    },
  ];

  if (ctx.styleGuide && ctx.styleGuide.trim()) {
    system.push({
      cache: true,
      text: `Campaign style guide (honor this tone and these constraints):\n${ctx.styleGuide.trim()}`,
    });
  }

  // Persona voice block (M6) — prepended for dungeon-voiced kinds so the flavor
  // reads as the System AI's current self. Marked cacheable: it's stable across
  // a run. The no-reveal rule keeps secret agendas out of the produced text;
  // it's a proposal a DM reviews and players only ever read approved canon.
  if (ctx.personaPrompt && ctx.personaPrompt.trim()) {
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
    `Entity type: ${formatEntityType(ctx.entity.type)}`,
    `Name: ${ctx.entity.name}`,
    `Currently a stub: ${ctx.entity.isStub ? "yes" : "no"}`,
    "",
    "Current canon (reference — enrich, don't contradict):",
    `- Summary: ${ctx.entity.summary?.trim() || "(empty)"}`,
    `- Description: ${ctx.entity.description?.trim() || "(empty)"}`,
    `- Tags: ${ctx.entity.tags.length ? ctx.entity.tags.join(", ") : "(none)"}`,
  ];

  if (ctx.relatedCanon && ctx.relatedCanon.length) {
    lines.push(
      "",
      "Related canon (reference — keep your additions consistent with this; do not restate or modify it):",
      ...ctx.relatedCanon.map((related) => {
        const reference = relatedReference(related);
        const tags = related.tags.length ? ` [tags: ${related.tags.join(", ")}]` : "";
        return `- ${formatEntityType(related.type)} · ${related.name}: ${reference}${tags}`;
      }),
    );
  }

  if (ctx.campaignTags && ctx.campaignTags.length) {
    lines.push("", `Existing campaign tags to prefer: ${ctx.campaignTags.join(", ")}`);
  }

  if (locked.length) {
    lines.push(
      "",
      `Do NOT propose changes to these locked fields (read-only): ${locked.join(", ")}.`,
    );
  }

  lines.push(
    "",
    `Propose new values for: ${writable.join(", ")}.`,
    "Return them in the required structured form.",
  );

  return {
    system,
    messages: [{ role: "user", content: lines.join("\n") }],
  };
}

type FleshEntityCurrent = {
  version: number;
  summary: string | null;
  description: string | null;
  tags: string[];
};

// Turn the model's output into a ReviewPatch (current → proposed), dropping any
// locked field and any field the model left effectively unchanged. Returns an
// empty-content patch (only `_baseVersion`) when nothing meaningful changed, so
// the service can refuse to file a no-op proposal.
export function fleshEntityToPatch(
  current: FleshEntityCurrent,
  output: FleshEntityOutput,
  lockedFields?: FleshableField[],
): ReviewPatch {
  const writable = new Set(writableFields(lockedFields));
  const patch: ReviewPatch = { _baseVersion: { to: current.version } };

  if (writable.has("summary")) {
    const next = output.summary.trim();
    if (next && next !== (current.summary ?? "")) {
      patch.summary = { from: current.summary, to: next };
    }
  }
  if (writable.has("description")) {
    const next = output.description.trim();
    if (next && next !== (current.description ?? "")) {
      patch.description = { from: current.description, to: next };
    }
  }
  if (writable.has("tags")) {
    const next = normalizeTags(output.tags);
    if (next.length && !sameTags(next, current.tags)) {
      patch.tags = { from: current.tags, to: next };
    }
  }

  return patch;
}

// True when the patch carries at least one proposed field beyond `_baseVersion`.
export function patchHasChanges(patch: ReviewPatch): boolean {
  return Object.keys(patch).some((k) => k !== "_baseVersion");
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b.map((t) => t.toLowerCase()));
  return a.every((t) => setB.has(t.toLowerCase()));
}
