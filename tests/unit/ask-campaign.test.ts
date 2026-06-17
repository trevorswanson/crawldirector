import { describe, expect, it } from "vitest";

import {
  ASK_CAMPAIGN_GENERATOR,
  MAX_QUESTION_LENGTH,
  buildAskPrompt,
  parseCitedIndices,
  type AskPromptContext,
} from "@/server/ai/generators/ask-campaign";

function ctx(over: Partial<AskPromptContext> = {}): AskPromptContext {
  return {
    campaignName: "Carl's Doomed Run",
    question: "What is the Maestro plotting?",
    isPlayer: false,
    sources: [
      { index: 1, kind: "NPC", title: "The Maestro", content: "The Maestro\nA manipulative manager." },
      { index: 2, kind: "Event", title: "Floor 9 siege", content: "Floor 9 siege\nThe siege begins." },
    ],
    ...over,
  };
}

describe("ASK_CAMPAIGN_GENERATOR", () => {
  it("has a stable id and version", () => {
    expect(ASK_CAMPAIGN_GENERATOR.id).toBe("ask-campaign");
    expect(ASK_CAMPAIGN_GENERATOR.version).toBe("1");
  });
});

describe("buildAskPrompt", () => {
  it("frames a grounded, cited, read-only answer in a cacheable system block", () => {
    const { system } = buildAskPrompt(ctx());
    expect(system[0].cache).toBe(true);
    const text = system[0].text;
    expect(text).toMatch(/ONLY the campaign canon/i);
    expect(text).toMatch(/\[1\] or/);
    expect(text).toMatch(/do not.*propose edits|read-only/i);
    expect(text).toMatch(/say so plainly/i);
  });

  it("numbers each source with its kind, title and content, and ends with the question", () => {
    const { messages } = buildAskPrompt(ctx());
    const user = messages[0].content;
    expect(user).toContain("[1] NPC — The Maestro");
    expect(user).toContain("A manipulative manager.");
    expect(user).toContain("[2] Event — Floor 9 siege");
    expect(user).toContain("Question: What is the Maestro plotting?");
    expect(user).toMatch(/citing them as \[n\]/);
  });

  it("adds a cacheable style-guide block when present", () => {
    const { system } = buildAskPrompt(ctx({ styleGuide: "Gritty and sardonic." }));
    expect(system).toHaveLength(2);
    expect(system[1].cache).toBe(true);
    expect(system[1].text).toContain("Gritty and sardonic.");
  });

  it("omits the style-guide block when blank", () => {
    expect(buildAskPrompt(ctx({ styleGuide: "   " })).system).toHaveLength(1);
    expect(buildAskPrompt(ctx({ styleGuide: null })).system).toHaveLength(1);
  });

  it("adds a fog-of-war reminder for a player ask", () => {
    const dm = buildAskPrompt(ctx({ isPlayer: false })).messages[0].content;
    const player = buildAskPrompt(ctx({ isPlayer: true })).messages[0].content;
    expect(dm).not.toMatch(/answering for a player/i);
    expect(player).toMatch(/answering for a player/i);
  });

  it("substitutes a placeholder for a source with no content", () => {
    const { messages } = buildAskPrompt(
      ctx({ sources: [{ index: 1, kind: "NPC", title: "Ghost", content: "" }] }),
    );
    expect(messages[0].content).toContain("(no further detail)");
  });
});

describe("parseCitedIndices", () => {
  it("extracts sorted, de-duplicated in-range citations", () => {
    expect(parseCitedIndices("Carl [2] fought the Maestro [1], then [2] again.", 3)).toEqual([1, 2]);
  });

  it("drops out-of-range citations so a hallucinated marker can't link", () => {
    expect(parseCitedIndices("See [9] and [0] and [2].", 3)).toEqual([2]);
  });

  it("returns an empty list when nothing is cited", () => {
    expect(parseCitedIndices("No citations here.", 3)).toEqual([]);
    expect(parseCitedIndices("Mentions [1] but there are no sources.", 0)).toEqual([]);
  });
});

describe("MAX_QUESTION_LENGTH", () => {
  it("is a sane bound", () => {
    expect(MAX_QUESTION_LENGTH).toBeGreaterThan(100);
  });
});
