// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, listEntitiesForUser, notFound } =
  vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  listEntitiesForUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/entities", () => ({ listEntitiesForUser }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/entities/entity-forms", () => ({
  CreateCrawlerForm: ({ campaignId }: { campaignId: string }) => (
    <div>Create crawler form {campaignId}</div>
  ),
  CreateGenericEntityForm: ({ campaignId }: { campaignId: string }) => (
    <div>Create entity form {campaignId}</div>
  ),
}));

import CampaignPage from "@/app/(dm)/campaigns/[id]/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  listEntitiesForUser.mockResolvedValue({ entities: [], role: "OWNER" });
});

afterEach(cleanup);

describe("CampaignPage", () => {
  it("renders the campaign with summary, role, and singular member count", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      summary: "A grand world",
      createdAt: new Date(),
      members: [{ role: "OWNER" }],
      _count: { members: 1, entities: 0 },
    });

    render(
      await CampaignPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "World One" })).toBeDefined();
    expect(screen.getByText("A grand world")).toBeDefined();
    expect(screen.getByText("Role · OWNER")).toBeDefined();
    expect(screen.getByText("1 member")).toBeDefined();
    expect(screen.getByText("0 entities")).toBeDefined();
    expect(getCampaignForUser).toHaveBeenCalledWith("u1", "c1");
    expect(listEntitiesForUser).toHaveBeenCalledWith("u1", "c1", {
      query: undefined,
      type: "ALL",
    });
  });

  it("omits the summary, defaults the role, and pluralizes counts", async () => {
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
        searchParams: Promise.resolve({ q: "carl", type: "CRAWLER" }),
      }),
    );

    expect(screen.getByText("Role · MEMBER")).toBeDefined();
    expect(screen.getByText("3 members")).toBeDefined();
    expect(screen.getByText("1 entity")).toBeDefined();
    expect(listEntitiesForUser).toHaveBeenCalledWith("u1", "c2", {
      query: "carl",
      type: "CRAWLER",
    });
  });

  it("renders matching entities in the world browser", async () => {
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
    expect(screen.getByText("Lv 2 · Floor 1")).toBeDefined();
  });

  it("calls notFound when the user is not a member", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      CampaignPage({ params: Promise.resolve({ id: "missing" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
