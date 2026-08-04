import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, askCampaign, createPlayerSuggestion, revalidatePath } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  askCampaign: vi.fn(),
  createPlayerSuggestion: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/ask", () => ({ askCampaign }));
vi.mock("@/server/services/review", () => ({ createPlayerSuggestion }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { askCampaignAction, submitSuggestionAction } from "@/app/(player)/actions";
import { ServiceError } from "@/lib/errors";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
});

describe("askCampaignAction (player)", () => {
  it("passes the question and returns the answer + sources", async () => {
    const sources = [
      {
        index: 1,
        cited: true,
        targetType: "ENTITY" as const,
        targetId: "e1",
        kind: "NPC",
        label: "The Maestro",
        href: "/campaigns/c1/entities/e1",
      },
    ];
    askCampaign.mockResolvedValue({
      role: "PLAYER",
      question: "Who is the Maestro?",
      answer: "A manipulative manager [1].",
      grounded: true,
      sources,
      model: "claude-opus-4-8",
      providerId: "anthropic",
    });

    const result = await askCampaignAction("c1", undefined, form({ question: "Who is the Maestro?" }));

    expect(askCampaign).toHaveBeenCalledWith("u1", "c1", "Who is the Maestro?");
    expect(result?.answer).toBe("A manipulative manager [1].");
    expect(result?.grounded).toBe(true);
    expect(result?.sources).toEqual(sources);
    expect(result?.model).toBe("claude-opus-4-8");
    expect(result?.error).toBeUndefined();
  });

  it("surfaces a ServiceError message and a generic fallback", async () => {
    askCampaign.mockRejectedValueOnce(new ServiceError("You do not have access to this campaign."));
    expect((await askCampaignAction("c1", undefined, form({ question: "x" })))?.error).toBe(
      "You do not have access to this campaign.",
    );

    askCampaign.mockRejectedValueOnce(new Error("boom"));
    expect((await askCampaignAction("c1", undefined, form({ question: "x" })))?.error).toBe(
      "The System couldn't answer that. Please try again.",
    );
  });
});

describe("submitSuggestionAction (player)", () => {
  it("parses the form, submits the suggestion, and revalidates", async () => {
    createPlayerSuggestion.mockResolvedValue({ id: "cs1", title: "Suggestion for Carl", status: "PENDING" });

    const result = await submitSuggestionAction(
      "c1",
      undefined,
      form({ summary: "New bio", description: "New notes" }),
    );

    expect(createPlayerSuggestion).toHaveBeenCalledWith("u1", "c1", {
      summary: "New bio",
      description: "New notes",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/play/campaigns/c1/suggestions");
    expect(result?.success).toMatch(/submitted/i);
    expect(result?.error).toBeUndefined();
  });

  it("rejects an overlong field before calling the service", async () => {
    const result = await submitSuggestionAction(
      "c1",
      undefined,
      form({ summary: "a".repeat(501) }),
    );
    expect(createPlayerSuggestion).not.toHaveBeenCalled();
    expect(result?.error).toBeTruthy();
  });

  it("surfaces a ServiceError message and a generic fallback", async () => {
    createPlayerSuggestion.mockRejectedValueOnce(new ServiceError("You have no crawler linked yet."));
    expect(
      (await submitSuggestionAction("c1", undefined, form({ summary: "x" })))?.error,
    ).toBe("You have no crawler linked yet.");

    createPlayerSuggestion.mockRejectedValueOnce(new Error("boom"));
    expect(
      (await submitSuggestionAction("c1", undefined, form({ summary: "x" })))?.error,
    ).toBe("Could not submit your suggestion. Please try again.");
  });
});
