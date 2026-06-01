// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { RelationshipGraph } from "@/components/graph/relationship-graph";
import type { GraphEdge, GraphNode } from "@/server/services/relationships";

const nodes: GraphNode[] = [
  { id: "carl", name: "Carl", type: "CRAWLER", locked: false },
  { id: "donut", name: "Donut", type: "CRAWLER", locked: true },
  { id: "mordecai", name: "Mordecai", type: "NPC", locked: false },
];

const edges: GraphEdge[] = [
  { id: "e1", type: "ALLY_OF", sourceId: "carl", targetId: "donut", secret: false, locked: false },
  { id: "e2", type: "MENTOR_OF", sourceId: "mordecai", targetId: "carl", secret: true, locked: false },
];

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("RelationshipGraph", () => {
  it("renders a node for every entity and a legend of types", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    expect(screen.getByText("Carl")).toBeDefined();
    expect(screen.getByText("Donut")).toBeDefined();
    expect(screen.getByText("Mordecai")).toBeDefined();
    // Legend: two distinct types present (Crawler ×2, Npc ×1).
    expect(screen.getByText("Crawler")).toBeDefined();
    expect(screen.getByText("Npc")).toBeDefined();
  });

  it("navigates to the entity when a node is clicked", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    fireEvent.click(screen.getByRole("button", { name: "Carl" }));
    expect(push).toHaveBeenCalledWith("/campaigns/c1/entities/carl");
  });

  it("navigates on Enter for keyboard users", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Donut" }), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/campaigns/c1/entities/donut");
  });

  it("navigates on Space for keyboard users", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Mordecai" }), { key: " " });
    expect(push).toHaveBeenCalledWith("/campaigns/c1/entities/mordecai");
  });

  it("highlights a node's edges on hover and restores on leave", () => {
    const { container } = render(
      <RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />,
    );
    const carl = screen.getByRole("button", { name: "Carl" });

    // Hover Carl: its edges highlight (accent), unrelated edges dim.
    fireEvent.mouseEnter(carl);
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBe(2);
    expect([...lines].some((l) => l.getAttribute("stroke") === "var(--accent)")).toBe(true);

    fireEvent.mouseLeave(carl);
    expect(
      [...container.querySelectorAll("line")].every(
        (l) => l.getAttribute("stroke") !== "var(--accent)",
      ),
    ).toBe(true);
  });

  it("labels each edge with its directional relationship phrase", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    // <title> children are accessible by text content.
    expect(screen.getByText(/Carl .* Donut/)).toBeDefined();
    // The secret edge is annotated.
    expect(screen.getByText(/· secret/)).toBeDefined();
  });
});
