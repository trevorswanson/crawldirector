// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, resolveCampaignProvider, notFound } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  resolveCampaignProvider: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/ai", () => ({ resolveCampaignProvider }));
vi.mock("next/navigation", () => ({ notFound }));
// The Ask form is a client component with its own test; here we only assert
// the page's provider gating decides whether to render it.
vi.mock("@/components/ask/ask-panel", () => ({
  AskPanel: () => <div data-testid="ask-panel" />,
}));
// The page only needs a bindable reference — mocked so its real dependency
// chain (auth composition, search/embeddings) never loads under Vitest.
vi.mock("@/app/(player)/actions", () => ({ askCampaignAction: vi.fn() }));

import PlayerAskPage from "@/app/(player)/play/campaigns/[id]/ask/page";

function renderPage() {
  return PlayerAskPage({ params: Promise.resolve({ id: "c1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "Dungeon", members: [{ role: "PLAYER" }] });
  resolveCampaignProvider.mockResolvedValue({ id: "anthropic", model: "claude-opus-4-8" });
});

afterEach(() => cleanup());

describe("Ask the System (player) page", () => {
  it("404s a non-member (never leaks existence)", async () => {
    getCampaignForUser.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders the Ask panel when a chat provider is configured", async () => {
    render(await renderPage());
    expect(screen.getByTestId("ask-panel")).toBeTruthy();
    expect(screen.getByText("THE SYSTEM")).toBeTruthy();
  });

  it("shows a no-provider notice with no Settings link when unconfigured", async () => {
    resolveCampaignProvider.mockResolvedValue(null);
    render(await renderPage());
    expect(screen.queryByTestId("ask-panel")).toBeNull();
    expect(screen.getByText(/not listening yet/i)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
