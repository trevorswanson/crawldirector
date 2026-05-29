// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  listEntitiesForUser,
  getEntityTypeCounts,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listEntitiesForUser: vi.fn(),
  getEntityTypeCounts: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/entities", () => ({
  listEntitiesForUser,
  getEntityTypeCounts,
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/entities/entity-forms", () => ({
  QuickCreateStub: ({ campaignId }: { campaignId: string }) => (
    <div>Quick create {campaignId}</div>
  ),
}));

import CampaignPage from "@/app/(dm)/campaigns/[id]/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  listEntitiesForUser.mockResolvedValue({ entities: [], role: "OWNER" });
  getEntityTypeCounts.mockResolvedValue({});
});

afterEach(cleanup);

describe("CampaignPage", () => {
  it("renders the world browser shell and passes default filters", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      summary: "A grand world",
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 0 },
    });
    getEntityTypeCounts.mockResolvedValue({ CRAWLER: 2 });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "World One" })).toBeDefined();
    expect(screen.getByText("A grand world")).toBeDefined();
    expect(screen.getByText("Entity type")).toBeDefined();
    expect(screen.getByText("Locked only")).toBeDefined();
    expect(screen.getByText("Quick create c1")).toBeDefined();
    // count chip: 0 results / 2 total
    expect(screen.getByText("0 / 2")).toBeDefined();
    expect(listEntitiesForUser).toHaveBeenCalledWith("u1", "c1", {
      query: undefined,
      type: "ALL",
      status: "ALL",
      source: undefined,
      lockedOnly: false,
    });
    expect(getEntityTypeCounts).toHaveBeenCalledWith("u1", "c1");
  });

  it("translates facet search params into service filters", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c2",
      name: "World Two",
      summary: null,
      createdAt: new Date(),
      members: [],
      _count: { members: 3, entities: 1 },
    });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c2" }),
        searchParams: Promise.resolve({
          q: "carl",
          type: "CRAWLER",
          status: "PENDING",
          source: "PLAYER",
          locked: "1",
        }),
      }),
    );

    expect(listEntitiesForUser).toHaveBeenCalledWith("u1", "c2", {
      query: "carl",
      type: "CRAWLER",
      status: "PENDING",
      source: "PLAYER_SUGGESTION",
      lockedOnly: true,
    });
  });

  it("renders entity cards linking to detail", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c3",
      name: "World Three",
      summary: null,
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 1 },
    });
    listEntitiesForUser.mockResolvedValue({
      role: "OWNER",
      entities: [
        {
          id: "e1",
          type: "CRAWLER",
          name: "Carl",
          summary: "No shoes",
          status: "CANON",
          visibility: "PLAYER_FACING",
          tags: [],
          locked: true,
          isStub: false,
          updatedAt: new Date(),
          crawler: {
            level: 2,
            realName: "Carl",
            crawlerNo: "1",
            isAlive: true,
            currentFloor: 1,
          },
        },
      ],
    });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c3" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("link", { name: /Carl/ }).getAttribute("href"),
    ).toBe("/campaigns/c3/entities/e1");
    expect(screen.getByText("Floor 1")).toBeDefined();
  });

  it("shows an empty state when no entities match", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c4",
      name: "World Four",
      summary: null,
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 0 },
    });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c4" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByText(/No entities match/),
    ).toBeDefined();
  });

  it("calls notFound when the user is not a member", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      CampaignPage({
        params: Promise.resolve({ id: "missing" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
