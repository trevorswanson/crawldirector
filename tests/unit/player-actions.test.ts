import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, askCampaign } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  askCampaign: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/ask", () => ({ askCampaign }));

import { askCampaignAction } from "@/app/(player)/actions";
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
