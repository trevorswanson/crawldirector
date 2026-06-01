// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

let rafCallbacks: FrameRequestCallback[];

function rect(width: number, height: number): DOMRect {
  return {
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

beforeEach(() => {
  vi.clearAllMocks();
  rafCallbacks = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue(
    rect(1200, 820),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

import { RelationshipGraph } from "@/components/graph/relationship-graph";
import type { GraphEdge, GraphNode } from "@/server/services/relationships";

const nodes: GraphNode[] = [
  { id: "carl", name: "Carl", type: "CRAWLER", locked: false },
  { id: "donut", name: "Donut", type: "CRAWLER", locked: true },
  { id: "mordecai", name: "Mordecai", type: "NPC", locked: false },
];

const edges: GraphEdge[] = [
  { id: "e1", type: "ALLY_OF", sourceId: "carl", targetId: "donut", disposition: 80, secret: false, locked: false },
  { id: "e2", type: "MENTOR_OF", sourceId: "mordecai", targetId: "carl", disposition: null, secret: true, locked: false },
];

describe("RelationshipGraph", () => {
  it("renders a node for every entity plus the type-filter toolbar", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    // Node labels in the canvas.
    expect(screen.getAllByText("Carl").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mordecai").length).toBeGreaterThan(0);
    // Filter buttons: CRAWLER (×2) and NPC (×1) plus a secret toggle.
    expect(screen.getByRole("button", { name: /Crawler/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Npc/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Secret/ })).toBeDefined();
  });

  it("shows the selected node's connections with a disposition readout", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    // Carl is selected by default (first node) → side panel lists its 2 edges.
    expect(screen.getByRole("heading", { name: "Carl" })).toBeDefined();
    expect(screen.getByText("2 connections")).toBeDefined();
    expect(screen.getByText("disposition +80")).toBeDefined();
  });

  it("re-selects the other entity when a connection row is clicked", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    // Click the connection row leading to Donut.
    const row = screen.getByRole("button", { name: "Select Donut connection" });
    fireEvent.click(row);
    expect(screen.getByRole("heading", { name: "Donut" })).toBeDefined();
  });

  it("selects a node on Enter and links the side panel to the entity page", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Mordecai" }), { key: "Enter" });
    const heading = screen.getByRole("heading", { name: "Mordecai" });
    const panel = heading.closest("div")!.parentElement!;
    const open = within(panel).getByRole("link", { name: /Open/ });
    expect(open.getAttribute("href")).toBe("/campaigns/c1/entities/mordecai");
  });

  it("hides a type's nodes when its filter is toggled off", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    expect(screen.getAllByText("Mordecai").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Npc/ }));
    // The NPC node label is gone from the canvas (Mordecai is the only NPC).
    expect(screen.queryByText((t, el) => el?.tagName === "text" && t === "Mordecai")).toBeNull();
  });

  it("annotates the secret edge", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);
    expect(screen.getByText(/Mordecai .* Carl/)).toBeDefined();
    expect(screen.getAllByText(/· secret/).length).toBeGreaterThan(0);
  });

  it("runs one force-simulation frame without losing rendered nodes", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    expect(rafCallbacks.length).toBeGreaterThan(0);
    act(() => {
      rafCallbacks.shift()?.(0);
    });

    expect(screen.getByRole("button", { name: "Carl" })).toBeDefined();
    expect(screen.getByText(/Carl .* Donut/)).toBeDefined();
  });

  it("stops scheduling simulation frames once the layout settles", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    for (let i = 0; i < 700; i++) {
      const callback = rafCallbacks.shift();
      if (!callback) break;
      act(() => {
        callback(i);
      });
    }

    expect(rafCallbacks).toHaveLength(0);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Carl" }), {
      clientX: 600,
      clientY: 90,
    });
    fireEvent.pointerUp(screen.getByRole("img", { name: "Relationship graph" }));
    expect(rafCallbacks.length).toBeGreaterThan(0);
  });

  it("supports pan, zoom, reset, and drag interactions", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    const svg = screen.getByRole("img", { name: "Relationship graph" });
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 20 });
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 55 });
    expect(svg.getAttribute("style")).toContain("cursor: grabbing");
    expect(document.querySelector("rect")?.getAttribute("transform")).toBe(
      "translate(30,35) scale(1)",
    );

    fireEvent.pointerUp(svg);
    expect(svg.getAttribute("style")).toContain("cursor: grab");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(document.querySelector("rect")?.getAttribute("transform")).toBe(
      "translate(30,35) scale(1.18)",
    );

    const carl = screen.getByRole("button", { name: "Carl" });
    fireEvent.pointerDown(carl, { clientX: 600, clientY: 90 });
    fireEvent.pointerMove(svg, { clientX: 700, clientY: 300 });
    expect(
      screen.getByRole("button", { name: "Carl" }).getAttribute("transform"),
    ).toMatch(/^translate\(567\.796610169491[56],224\.576271186440[67]\)$/);
    fireEvent.pointerLeave(svg);

    fireEvent.click(screen.getByText("Reset layout"));
    expect(document.querySelector("rect")?.getAttribute("transform")).toBe(
      "translate(0,0) scale(1)",
    );
  });

  it("maps dragged nodes through preserveAspectRatio slice scaling", () => {
    vi.mocked(SVGElement.prototype.getBoundingClientRect).mockReturnValue(
      rect(600, 820),
    );
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    const svg = screen.getByRole("img", { name: "Relationship graph" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Carl" }), {
      clientX: 600,
      clientY: 90,
    });
    fireEvent.pointerMove(svg, { clientX: 0, clientY: 90 });

    expect(screen.getByRole("button", { name: "Carl" }).getAttribute("transform")).toBe(
      "translate(300,90)",
    );
  });

  it("hides secret edges from the canvas when the secret filter is toggled off", () => {
    render(<RelationshipGraph campaignId="c1" nodes={nodes} edges={edges} />);

    fireEvent.click(screen.getByRole("button", { name: /Secret/ }));

    expect(screen.queryByText(/Mordecai .* Carl/)).toBeNull();
    expect(screen.getByRole("button", { name: /Secret/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("renders an empty graph shell without selected-node chrome", () => {
    render(<RelationshipGraph campaignId="c1" nodes={[]} edges={[]} />);

    act(() => {
      rafCallbacks.shift()?.(0);
    });

    expect(screen.getByRole("img", { name: "Relationship graph" })).toBeDefined();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button", { name: /Secret/ })).toBeNull();
  });
});
