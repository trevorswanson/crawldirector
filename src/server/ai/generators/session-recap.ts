import type { LLMMessage, LLMSystemBlock } from "../types";

// Session recap generator (M8 slice 4 — docs/08-session-mode.md "Recaps &
// broadcasts"). Turns one session's raw log + the events it promoted into a
// punchy "previously on Dungeon Crawler World" summary. Strictly read-only
// synthesis (invariant #1) — a recap is flavor narration over already-captured
// material, never a new proposal, so unlike the other generators in
// `src/server/ai/generators` it produces no change-set operations at all.
//
// Pure + UI-agnostic — no DB, no provider SDK, no secrets — so it's exhaustively
// unit-testable. Orchestration (load the session, call the provider, record
// usage) lives in `src/server/services/sessions.ts`.

// Versioned generator identity, recorded on the `AiUsage` row so a DM can trace
// which prompt produced a recap / how much it cost. Bump `version` when the
// prompt changes meaningfully. (A recap is not canon, so it carries no
// review-pipeline provenance — only a usage/cost trail, like "Ask".)
export const SESSION_RECAP_GENERATOR = {
  id: "session-recap",
  version: "1",
} as const;

// Bounds on the synthesized recap. TV-style "previously on" narration should be
// tight — a few punchy beats, not a full session transcript.
export const SESSION_RECAP_MAX_TOKENS = 768;

export type SessionRecapLogEntry = {
  text: string;
  taggedNames: string[];
};

export type SessionRecapPromotedEvent = {
  title: string;
  summary: string | null;
  participantNames: string[];
};

export type SessionRecapContext = {
  campaignName: string;
  styleGuide?: string | null;
  sessionTitle: string;
  playedAt?: string | null;
  focus?: string | null;
  entries: SessionRecapLogEntry[];
  promotedEvents: SessionRecapPromotedEvent[];
};

// Build the provider request (system blocks + user message). The stable framing
// + style guide are marked cacheable (prompt caching on providers that support
// it); the per-session log/events are volatile and left uncached.
export function buildSessionRecapPrompt(ctx: SessionRecapContext): {
  system: LLMSystemBlock[];
  messages: LLMMessage[];
} {
  const system: LLMSystemBlock[] = [
    {
      cache: true,
      text: [
        "You write \"previously on Dungeon Crawler World\" recap narration for a",
        "Dungeon Crawler Carl (DCC) tabletop campaign — a deadly, satire-laced,",
        "livestreamed dungeon crawl. You're given a DM's raw session notes and the",
        "events that session promoted to canon.",
        "",
        "Rules:",
        "- Ground every beat in the notes/events provided. Do NOT invent details",
        "  or outcomes that aren't there — you may deliver them with the show's",
        "  punchy promo energy, but never fabricate what happened.",
        "- Hit the biggest beats roughly in the order they occurred. Skip filler;",
        "  a quiet or empty note can be left out entirely.",
        "- Keep it tight: a few short paragraphs at most, not an exhaustive replay.",
        "- This is flavor narration for the table, not a change to canon. Do not",
        "  claim to be creating or approving game state.",
      ].join("\n"),
    },
  ];

  if (ctx.styleGuide?.trim()) {
    system.push({
      cache: true,
      text: `Campaign style guide (honor this tone when phrasing the recap):\n${ctx.styleGuide.trim()}`,
    });
  }

  const lines: string[] = [`Campaign: ${ctx.campaignName}`, `Session: ${ctx.sessionTitle}`];
  if (ctx.playedAt) lines.push(`Played: ${ctx.playedAt}`);
  if (ctx.focus) lines.push(`Focus: ${ctx.focus}`);

  if (ctx.promotedEvents.length > 0) {
    lines.push("", "Events promoted to canon this session:");
    for (const event of ctx.promotedEvents) {
      const who = event.participantNames.length > 0 ? ` (${event.participantNames.join(", ")})` : "";
      lines.push(`- ${event.title}${who}: ${event.summary?.trim() || "(no summary)"}`);
    }
  }

  if (ctx.entries.length > 0) {
    lines.push("", "Raw session log, chronological:");
    for (const entry of ctx.entries) {
      const tags = entry.taggedNames.length > 0 ? ` [${entry.taggedNames.join(", ")}]` : "";
      lines.push(`- ${entry.text}${tags}`);
    }
  }

  lines.push("", "Write the recap now.");

  return {
    system,
    messages: [{ role: "user", content: lines.join("\n") }],
  };
}
