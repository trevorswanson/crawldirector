// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, notFound } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import CampaignPage from "@/app/(dm)/campaigns/[id]/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
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
      _count: { members: 1 },
    });

    render(await CampaignPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByRole("heading", { name: "World One" })).toBeDefined();
    expect(screen.getByText("A grand world")).toBeDefined();
    expect(screen.getByText("Role: OWNER")).toBeDefined();
    expect(screen.getByText("1 member")).toBeDefined();
    expect(getCampaignForUser).toHaveBeenCalledWith("u1", "c1");
  });

  it("omits the summary, defaults the role, and pluralizes members", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c2",
      name: "World Two",
      summary: null,
      createdAt: new Date(),
      members: [],
      _count: { members: 3 },
    });

    render(await CampaignPage({ params: Promise.resolve({ id: "c2" }) }));

    expect(screen.getByText("Role: MEMBER")).toBeDefined();
    expect(screen.getByText("3 members")).toBeDefined();
  });

  it("calls notFound when the user is not a member", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      CampaignPage({ params: Promise.resolve({ id: "missing" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
