import type { LLMMessage, LLMSystemBlock } from "../types";

// "Ask the Campaign" synthesis generator (M5 slice 5 — docs/07-search-retrieval.md).
// Retrieval-augmented Q&A: the service retrieves the top-k *visibility-scoped*
// canon documents (the same projection search uses — invariant #5) and this
// generator turns a question + those numbered sources into a grounded,
// **cited** prose answer. Strictly read-only — "Ask" never writes canon
// (invariant #1); the result is a synthesized view, not a proposal.
//
// Pure + UI-agnostic — no DB, no provider SDK, no secrets — so it's exhaustively
// unit-testable. The orchestration (retrieve scoped canon, call the provider,
// record usage, map citations back to source links) lives in
// `src/server/services/ask.ts`.

// Versioned generator identity, recorded on the `AiUsage` row so a DM can trace
// which prompt produced an answer / how much it cost. Bump `version` when the
// prompt changes meaningfully. ("Ask" output is not canon, so it carries no
// review-pipeline provenance — only a usage/cost trail.)
export const ASK_CAMPAIGN_GENERATOR = {
  id: "ask-campaign",
  version: "1",
} as const;

// Bounds on the synthesized answer. Q&A answers should be a few tight paragraphs,
// not an essay — the sources carry the detail and the answer points at them.
export const ASK_ANSWER_MAX_TOKENS = 1024;

// Upper bound on a question, enforced at the action boundary and here. Keeps a
// pathological prompt from blowing out the context window / cost.
export const MAX_QUESTION_LENGTH = 500;

// One retrieved canon document, numbered for citation. `content` is the
// denormalized SearchDoc text (name + summary + description + tags for an
// entity; the phrase + endpoints + notes for an edge; title + summary +
// description for an event) — already scoped to what the requester may see.
export type AskSourceContext = {
  /** 1-based citation index the model cites as `[n]`. */
  index: number;
  /** Short human label for the source kind, e.g. "Entity", "Relationship". */
  kind: string;
  /** Display title, e.g. the entity/event name or "A ALLY OF B". */
  title: string;
  /** The denormalized canon text the answer must be grounded in. */
  content: string;
};

export type AskPromptContext = {
  campaignName: string;
  styleGuide?: string | null;
  question: string;
  sources: AskSourceContext[];
  /** Player asks get a fog-of-war reminder; DM asks see everything retrieved. */
  isPlayer: boolean;
};

// Build the provider request (system blocks + user message). The stable framing
// + style guide are marked cacheable (prompt caching on providers that support
// it); the per-question sources are volatile and left uncached.
export function buildAskPrompt(ctx: AskPromptContext): {
  system: LLMSystemBlock[];
  messages: LLMMessage[];
} {
  const system: LLMSystemBlock[] = [
    {
      cache: true,
      text: [
        "You answer questions about a Dungeon Crawler Carl (DCC) tabletop",
        "campaign — a deadly, satire-laced, livestreamed dungeon crawl — using",
        "ONLY the campaign canon excerpts provided with each question.",
        "",
        "Rules:",
        "- Ground every claim in the provided sources. Do NOT use outside",
        "  knowledge of Dungeon Crawler Carl or invent details not in the sources.",
        "- Cite the sources you use inline with bracketed numbers like [1] or",
        "  [2], placed right after the claim they support. Cite every source you",
        "  rely on; you may cite more than one for a single claim, e.g. [1][3].",
        "- If the sources do not contain the answer, say so plainly instead of",
        "  guessing. It is better to admit the canon is silent than to fabricate.",
        "- Be concise and specific: a few tight paragraphs at most. The sources",
        "  carry the detail; your answer points the reader at them.",
        "- This is a read-only answer, never a change to canon. Do not propose",
        "  edits or claim anything has been saved.",
      ].join("\n"),
    },
  ];

  if (ctx.styleGuide && ctx.styleGuide.trim()) {
    system.push({
      cache: true,
      text: `Campaign style guide (honor this tone when phrasing your answer):\n${ctx.styleGuide.trim()}`,
    });
  }

  const lines: string[] = [`Campaign: ${ctx.campaignName}`];

  if (ctx.isPlayer) {
    lines.push(
      "You are answering for a player. The sources below are already limited to",
      "what this player's crawlers may know — do not speculate beyond them.",
    );
  }

  lines.push("", "Sources:");
  for (const source of ctx.sources) {
    lines.push(
      "",
      `[${source.index}] ${source.kind} — ${source.title}`,
      source.content.trim() || "(no further detail)",
    );
  }

  lines.push(
    "",
    `Question: ${ctx.question.trim()}`,
    "",
    "Answer the question using only the sources above, citing them as [n].",
  );

  return {
    system,
    messages: [{ role: "user", content: lines.join("\n") }],
  };
}

// Extract the 1-based source indices the model actually cited, as a sorted,
// de-duplicated list bounded to the real source count. Out-of-range or repeated
// citations are dropped, so the UI can only ever link a citation to a source it
// was actually given (a model that hallucinates `[9]` against 3 sources can't
// produce a dangling link).
export function parseCitedIndices(answer: string, sourceCount: number): number[] {
  const cited = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n >= 1 && n <= sourceCount) cited.add(n);
  }
  return [...cited].sort((a, b) => a - b);
}
