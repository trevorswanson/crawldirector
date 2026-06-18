// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  listAiKeys,
  getCampaignAiUsage,
  resolveCampaignEmbedder,
  getActiveCampaignJob,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listAiKeys: vi.fn(),
  getCampaignAiUsage: vi.fn(),
  resolveCampaignEmbedder: vi.fn(),
  getActiveCampaignJob: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/ai-keys", () => ({ listAiKeys }));
vi.mock("@/server/services/ai-usage", () => ({ getCampaignAiUsage }));
vi.mock("@/server/ai", () => ({ resolveCampaignEmbedder }));
vi.mock("@/server/services/jobs", () => ({ getActiveCampaignJob }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/settings/ai-keys-panel", () => ({
  AiKeysPanel: ({ campaignId, configured }: { campaignId: string; configured: unknown[] }) => (
    <div data-testid="ai-keys-panel">
      panel:{campaignId}:{configured.length}
    </div>
  ),
}));
vi.mock("@/components/settings/usage-panel", () => ({
  UsagePanel: ({ campaignId, usage }: { campaignId: string; usage: { runCount: number } }) => (
    <div data-testid="usage-panel">
      usage:{campaignId}:{usage.runCount}
    </div>
  ),
}));
// The "Build semantic index" button is a client component (its own action test
// covers it); here we only assert the page's embedder gating renders it.
vi.mock("@/components/search/build-semantic-index-button", () => ({
  BuildSemanticIndexButton: ({ activeJob }: { activeJob?: { status: string } | null }) => (
    <div data-testid="build-semantic-index">{activeJob?.status ?? "idle"}</div>
  ),
}));

import CampaignSettingsPage from "@/app/(dm)/campaigns/[id]/settings/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "World One", members: [{ role: "OWNER" }] });
  listAiKeys.mockResolvedValue([{ providerId: "anthropic", label: "Anthropic (Claude)", lastFour: "9999" }]);
  getCampaignAiUsage.mockResolvedValue({
    spendCapUsd: null,
    totalCostUsd: 0,
    runCount: 3,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    unpricedRunCount: 0,
  });
  resolveCampaignEmbedder.mockResolvedValue(null);
  getActiveCampaignJob.mockResolvedValue(null);
});

afterEach(() => cleanup());

describe("CampaignSettingsPage", () => {
  it("renders the AI keys and usage panels for a DM", async () => {
    render(await CampaignSettingsPage({ params: Promise.resolve({ id: "c1" }) }));
    expect(screen.getByRole("heading", { name: /AI provider/i })).toBeTruthy();
    // The settings sub-nav lists the planned (disabled) sections alongside AI.
    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.getByText("Crawlers")).toBeTruthy();
    expect(screen.getByTestId("ai-keys-panel").textContent).toBe("panel:c1:1");
    expect(screen.getByTestId("usage-panel").textContent).toBe("usage:c1:3");
    expect(listAiKeys).toHaveBeenCalledWith("u1", "c1");
    expect(getCampaignAiUsage).toHaveBeenCalledWith("u1", "c1");
  });

  it("shows Build semantic index when an embedder is configured", async () => {
    listAiKeys.mockResolvedValue([{ providerId: "openai", label: "OpenAI", lastFour: "9999" }]);
    render(await CampaignSettingsPage({ params: Promise.resolve({ id: "c1" }) }));
    expect(screen.getByTestId("build-semantic-index").textContent).toBe("idle");
    expect(getActiveCampaignJob).toHaveBeenCalledWith("u1", "c1", "EMBED_SEARCH_DOCS");
  });

  it("passes the active semantic job to the build button", async () => {
    listAiKeys.mockResolvedValue([{ providerId: "openai", label: "OpenAI", lastFour: "9999" }]);
    getActiveCampaignJob.mockResolvedValue({
      id: "j1",
      kind: "EMBED_SEARCH_DOCS",
      status: "RUNNING",
      error: null,
      result: null,
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: null,
    });
    render(await CampaignSettingsPage({ params: Promise.resolve({ id: "c1" }) }));
    expect(screen.getByTestId("build-semantic-index").textContent).toBe("RUNNING");
  });

  it("shows a hint instead of the button when no embedder is configured", async () => {
    render(await CampaignSettingsPage({ params: Promise.resolve({ id: "c1" }) }));
    expect(screen.queryByTestId("build-semantic-index")).toBeNull();
    expect(screen.getByText(/to enable semantic search/i)).toBeTruthy();
    expect(getActiveCampaignJob).not.toHaveBeenCalled();
  });

  it("still renders key management when the semantic capability check fails", async () => {
    resolveCampaignEmbedder.mockRejectedValue(new Error("invalid encrypted key"));
    render(await CampaignSettingsPage({ params: Promise.resolve({ id: "c1" }) }));
    expect(screen.getByTestId("ai-keys-panel").textContent).toBe("panel:c1:1");
    expect(screen.queryByTestId("build-semantic-index")).toBeNull();
    expect(screen.getByText(/to enable semantic search/i)).toBeTruthy();
    expect(getActiveCampaignJob).not.toHaveBeenCalled();
    expect(resolveCampaignEmbedder).not.toHaveBeenCalled();
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
