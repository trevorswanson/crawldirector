// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { createRelationshipAction, archiveRelationshipAction } = vi.hoisted(() => ({
  createRelationshipAction: vi.fn(),
  archiveRelationshipAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  createRelationshipAction,
  archiveRelationshipAction,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  ConnectionsPanel,
  type ConnectionCandidate,
} from "@/components/entities/connections-panel";
import type { EntityConnection } from "@/server/services/relationships";

const candidates: ConnectionCandidate[] = [
  { id: "e2", name: "Donut", type: "CRAWLER" },
  { id: "e3", name: "Mordecai", type: "NPC" },
];

function connection(overrides: Partial<EntityConnection> = {}): EntityConnection {
  return {
    id: "r1",
    type: "ALLY_OF",
    direction: "out",
    disposition: 50,
    notes: null,
    secret: false,
    source: "DM",
    other: { id: "e2", name: "Donut", type: "CRAWLER" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("ConnectionsPanel", () => {
  it("renders the empty state and an add toggle", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        connections={[]}
        candidates={candidates}
      />,
    );

    expect(screen.getByText("No relationships yet.")).toBeDefined();
    expect(screen.getByText("Connections · 0")).toBeDefined();
    // form not shown until opened
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
  });

  it("lists outgoing and incoming edges with direction and secret marker", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        connections={[
          connection(),
          connection({
            id: "r2",
            type: "BETRAYED",
            direction: "in",
            secret: true,
            other: { id: "e3", name: "Mordecai", type: "NPC" },
          }),
        ]}
        candidates={candidates}
      />,
    );

    expect(screen.getByText("Connections · 2")).toBeDefined();
    expect(screen.getByText("Donut")).toBeDefined();
    expect(screen.getByText("ALLY_OF")).toBeDefined();
    // secret edges are flagged
    expect(screen.getByText("BETRAYED · secret")).toBeDefined();
    // links point at the other entity
    expect(screen.getByText("Donut").closest("a")?.getAttribute("href")).toBe(
      "/campaigns/c1/entities/e2",
    );
  });

  it("opens the add form and lists candidate entities", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        connections={[]}
        candidates={candidates}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add connection/ }));
    expect(screen.getByText("DM-only (secret)")).toBeDefined();
    expect(screen.getByRole("option", { name: "Donut" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Mordecai" })).toBeDefined();

    // cancel hides it again
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("DM-only (secret)")).toBeNull();
  });

  it("prompts to create more entities when there are no candidates", () => {
    render(
      <ConnectionsPanel
        campaignId="c1"
        entityId="e1"
        connections={[]}
        candidates={[]}
      />,
    );

    expect(
      screen.getByText(/Create another entity to connect this one to it\./),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Add connection/ })).toBeNull();
  });
});
