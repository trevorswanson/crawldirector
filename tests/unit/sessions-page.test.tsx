// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, listSessions, notFound, createSessionAction } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    getCampaignForUser: vi.fn(),
    listSessions: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    createSessionAction: vi.fn(),
  }));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/sessions", () => ({ listSessions }));
vi.mock("@/app/(dm)/actions", () => ({ createSessionAction }));
vi.mock("next/navigation", () => ({ notFound }));

import CampaignSessionsPage from "@/app/(dm)/campaigns/[id]/sessions/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "World One",
    members: [{ role: "OWNER" }],
  });
  listSessions.mockResolvedValue([
    {
      id: "s1",
      title: "Session 12",
      playedAt: new Date("2026-08-04T00:00:00Z"),
      focus: "Floor 9",
      entryCount: 3,
      createdAt: new Date("2026-08-04T00:00:00Z"),
    },
  ]);
});

afterEach(() => cleanup());

describe("CampaignSessionsPage", () => {
  it("renders the create-session form and the session list", async () => {
    render(await CampaignSessionsPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText("Sessions")).toBeTruthy();
    expect(screen.getByText(/World One/)).toBeTruthy();
    expect(screen.getByLabelText("Session title")).toBeTruthy();
    expect(screen.getByText("Session 12")).toBeTruthy();
    expect(listSessions).toHaveBeenCalledWith("u1", "c1");
  });

  it("404s when the campaign is not visible to the user", async () => {
    getCampaignForUser.mockResolvedValue(null);
    await expect(
      CampaignSessionsPage({ params: Promise.resolve({ id: "c1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("404s for a player membership", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      members: [{ role: "PLAYER" }],
    });
    await expect(
      CampaignSessionsPage({ params: Promise.resolve({ id: "c1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listSessions).not.toHaveBeenCalled();
  });
});
