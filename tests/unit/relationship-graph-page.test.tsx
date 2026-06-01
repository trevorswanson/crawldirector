// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, getCampaignRelationshipGraph, notFound } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    getCampaignForUser: vi.fn(),
    getCampaignRelationshipGraph: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/relationships", () => ({ getCampaignRelationshipGraph }));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import RelationshipGraphPage from "@/app/(dm)/campaigns/[id]/graph/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({ id: "c1", name: "World One" });
});

afterEach(cleanup);

describe("RelationshipGraphPage", () => {
  it("renders the graph with a node/connection count", async () => {
    getCampaignRelationshipGraph.mockResolvedValue({
      nodes: [
        { id: "carl", name: "Carl", type: "CRAWLER", locked: false },
        { id: "donut", name: "Donut", type: "CRAWLER", locked: false },
      ],
      edges: [
        { id: "e1", type: "ALLY_OF", sourceId: "carl", targetId: "donut", secret: false, locked: false },
      ],
    });

    render(await RelationshipGraphPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByRole("heading", { name: "World One" })).toBeDefined();
    expect(screen.getByText("2 entities · 1 connections")).toBeDefined();
    expect(screen.getByText("Carl")).toBeDefined();
  });

  it("shows an honest empty state when there are no connections", async () => {
    getCampaignRelationshipGraph.mockResolvedValue({ nodes: [], edges: [] });

    render(await RelationshipGraphPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText(/No connections yet/)).toBeDefined();
    expect(screen.getByText("Open the World Browser")).toBeDefined();
  });

  it("404s for a non-member / missing campaign", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      RelationshipGraphPage({ params: Promise.resolve({ id: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
