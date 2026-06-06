// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, listAiKeys, notFound } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listAiKeys: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/ai-keys", () => ({ listAiKeys }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/settings/ai-keys-panel", () => ({
  AiKeysPanel: ({ campaignId, configured }: { campaignId: string; configured: unknown[] }) => (
    <div data-testid="ai-keys-panel">
      panel:{campaignId}:{configured.length}
    </div>
  ),
}));

import CampaignSettingsPage from "@/app/(dm)/campaigns/[id]/settings/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "World One", members: [{ role: "OWNER" }] });
  listAiKeys.mockResolvedValue([{ providerId: "anthropic", label: "Anthropic (Claude)", lastFour: "9999" }]);
});

afterEach(() => cleanup());

describe("CampaignSettingsPage", () => {
  it("renders the AI keys panel for a DM", async () => {
    render(await CampaignSettingsPage({ params: Promise.resolve({ id: "c1" }) }));
    expect(screen.getByRole("heading", { name: /Campaign settings/i })).toBeTruthy();
    expect(screen.getByTestId("ai-keys-panel").textContent).toBe("panel:c1:1");
    expect(listAiKeys).toHaveBeenCalledWith("u1", "c1");
  });

  it("404s when the campaign is not visible to the user", async () => {
    getCampaignForUser.mockResolvedValue(null);
    await expect(
      CampaignSettingsPage({ params: Promise.resolve({ id: "c1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listAiKeys).not.toHaveBeenCalled();
  });

  it("404s for a player member (settings is DM-only)", async () => {
    getCampaignForUser.mockResolvedValue({ id: "c1", name: "World One", members: [{ role: "PLAYER" }] });
    await expect(
      CampaignSettingsPage({ params: Promise.resolve({ id: "c1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listAiKeys).not.toHaveBeenCalled();
  });
});
