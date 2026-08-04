// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  getSession,
  listEntitiesForUser,
  notFound,
  addSessionLogEntryAction,
  promoteSessionLogEntryAction,
  searchEntityCandidatesAction,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  getSession: vi.fn(),
  listEntitiesForUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  addSessionLogEntryAction: vi.fn(),
  promoteSessionLogEntryAction: vi.fn(),
  searchEntityCandidatesAction: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/sessions", () => ({ getSession }));
vi.mock("@/server/services/entities", () => ({ listEntitiesForUser }));
vi.mock("@/app/(dm)/actions", () => ({
  addSessionLogEntryAction,
  promoteSessionLogEntryAction,
  searchEntityCandidatesAction,
}));
vi.mock("next/navigation", () => ({ notFound }));

import CampaignSessionDetailPage from "@/app/(dm)/campaigns/[id]/sessions/[sessionId]/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "World One",
    members: [{ role: "OWNER" }],
  });
  listEntitiesForUser.mockResolvedValue({
    entities: [{ id: "npc1", name: "Carl", type: "NPC" }],
    role: "OWNER",
    total: 1,
  });
  getSession.mockResolvedValue({
    id: "s1",
    title: "Session 12",
    playedAt: new Date("2026-08-04T00:00:00Z"),
    focus: "Floor 9",
    notes: "Bring snacks",
    createdAt: new Date("2026-08-04T00:00:00Z"),
    entries: [
      {
        id: "e1",
        at: new Date("2026-08-04T20:00:00Z"),
        text: "Donut insulted the Maestro",
        taggedEntities: [{ id: "npc1", name: "Carl", type: "NPC" }],
        promotedEventId: null,
      },
    ],
  });
});

afterEach(() => cleanup());

describe("CampaignSessionDetailPage", () => {
  it("renders session details, the log composer, and existing entries", async () => {
    render(
      await CampaignSessionDetailPage({
        params: Promise.resolve({ id: "c1", sessionId: "s1" }),
      }),
    );

    expect(screen.getByText("Session 12")).toBeTruthy();
    expect(screen.getByText(/Floor 9/)).toBeTruthy();
    expect(screen.getByText("Bring snacks")).toBeTruthy();
    expect(screen.getByLabelText("Log entry")).toBeTruthy();
    expect(screen.getByText("Donut insulted the Maestro")).toBeTruthy();
    expect(getSession).toHaveBeenCalledWith("u1", "c1", "s1");
  });

  it("404s when the session doesn't exist in the campaign", async () => {
    getSession.mockResolvedValue(null);
    await expect(
      CampaignSessionDetailPage({ params: Promise.resolve({ id: "c1", sessionId: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s for a player membership", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      members: [{ role: "PLAYER" }],
    });
    await expect(
      CampaignSessionDetailPage({ params: Promise.resolve({ id: "c1", sessionId: "s1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getSession).not.toHaveBeenCalled();
  });
});
