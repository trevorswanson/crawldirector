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
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
// The Ask form is a client component with its own test; here we only assert the
// page's provider gating decides whether to render it.
vi.mock("@/components/ask/ask-panel", () => ({
  AskPanel: ({ initialQuestion }: { initialQuestion?: string }) => (
    <div data-testid="ask-panel">{initialQuestion}</div>
  ),
}));

import CampaignAskPage from "@/app/(dm)/campaigns/[id]/ask/page";

function renderPage(searchParams?: { q?: string }) {
  return CampaignAskPage({
    params: Promise.resolve({ id: "c1" }),
    searchParams: Promise.resolve(searchParams ?? {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "World One", members: [{ role: "OWNER" }] });
  resolveCampaignProvider.mockResolvedValue({ id: "anthropic", model: "claude-opus-4-8" });
});

afterEach(() => cleanup());

describe("CampaignAskPage", () => {
  it("404s when the campaign is not visible to the user", async () => {
    getCampaignForUser.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders the Ask panel when a chat provider is configured", async () => {
    render(await renderPage());
    expect(screen.getByTestId("ask-panel")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Ask the Campaign/i })).toBeTruthy();
  });

  it("passes the search handoff question to the Ask panel", async () => {
    render(await renderPage({ q: "Who knows Mordecai?" }));
    expect(screen.getByTestId("ask-panel").textContent).toBe("Who knows Mordecai?");
  });

  it("shows a configure-a-key notice when no provider is configured", async () => {
    resolveCampaignProvider.mockResolvedValue(null);
    render(await renderPage());
    expect(screen.queryByTestId("ask-panel")).toBeNull();
    expect(screen.getByText(/No AI provider configured/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Configure AI in Settings/i });
    expect(link.getAttribute("href")).toBe("/campaigns/c1/settings");
  });
});
