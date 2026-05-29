// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, listCampaignsForUser } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listCampaignsForUser: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ listCampaignsForUser }));
vi.mock("@/components/campaigns/create-campaign-form", () => ({
  CreateCampaignForm: () => <div data-testid="create-campaign-form" />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import DashboardPage from "@/app/(dm)/dashboard/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
});

afterEach(cleanup);

describe("DashboardPage", () => {
  it("invites the user to create a campaign when they have none", async () => {
    listCampaignsForUser.mockResolvedValue([]);
    render(await DashboardPage());

    expect(screen.getByText("Your crawls")).toBeDefined();
    expect(screen.getByTestId("create-campaign-form")).toBeDefined();
    expect(
      screen.getByText("No crawls yet. Create your first one above."),
    ).toBeDefined();
  });

  it("lists the user's campaigns with summaries and roles", async () => {
    listCampaignsForUser.mockResolvedValue([
      {
        id: "c1",
        name: "World One",
        summary: "First world",
        createdAt: new Date(),
        members: [{ role: "OWNER" }],
      },
      {
        id: "c2",
        name: "World Two",
        summary: "",
        createdAt: new Date(),
        members: [],
      },
    ]);
    render(await DashboardPage());

    expect(screen.getByText("World One")).toBeDefined();
    expect(screen.getByText("First world")).toBeDefined();
    expect(screen.getByText("OWNER")).toBeDefined();
    // Falls back to "No summary yet." and the default MEMBER role.
    expect(screen.getByText("No summary yet.")).toBeDefined();
    expect(screen.getByText("MEMBER")).toBeDefined();
    expect(screen.getByRole("link", { name: /World Two/ }).getAttribute("href")).toBe(
      "/campaigns/c2",
    );
  });
});
