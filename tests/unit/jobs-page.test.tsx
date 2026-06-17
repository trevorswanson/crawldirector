// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, listRecentJobs, notFound } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listRecentJobs: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/jobs", () => ({ listRecentJobs }));
vi.mock("@/app/(dm)/actions", () => ({ cancelJobAction: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound }));

import CampaignJobsPage from "@/app/(dm)/campaigns/[id]/jobs/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "World One",
    members: [{ role: "OWNER" }],
  });
  listRecentJobs.mockResolvedValue([
    {
      id: "j1",
      kind: "EMBED_SEARCH_DOCS",
      status: "SUCCEEDED",
      error: null,
      result: { embedded: 4, model: "text-embedding-3-small" },
      createdAt: new Date("2026-06-16T11:00:00Z"),
      startedAt: new Date("2026-06-16T11:01:00Z"),
      finishedAt: new Date("2026-06-16T11:04:00Z"),
    },
  ]);
});

afterEach(() => cleanup());

describe("CampaignJobsPage", () => {
  it("renders the DM job queue with recent campaign jobs", async () => {
    render(await CampaignJobsPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText("Job Queue")).toBeTruthy();
    expect(screen.getByText(/World One/)).toBeTruthy();
    expect(screen.getByText("Semantic index")).toBeTruthy();
    expect(screen.getByText(/4 embedded/i)).toBeTruthy();
    expect(listRecentJobs).toHaveBeenCalledWith("u1", "c1", null);
  });

  it("404s when the campaign is not visible to the user", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      CampaignJobsPage({ params: Promise.resolve({ id: "c1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("404s for player memberships", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      members: [{ role: "PLAYER" }],
    });

    await expect(
      CampaignJobsPage({ params: Promise.resolve({ id: "c1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listRecentJobs).not.toHaveBeenCalled();
  });
});
