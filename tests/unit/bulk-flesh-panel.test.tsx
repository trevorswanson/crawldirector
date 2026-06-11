// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { fleshOutEntitiesAction, mockUseActionState } = vi.hoisted(() => ({
  fleshOutEntitiesAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ fleshOutEntitiesAction }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import { BulkFleshPanel } from "@/components/entities/bulk-flesh-panel";

const CANDIDATES = [
  { id: "e1", name: "Mordecai", type: "NPC" as const },
  { id: "e2", name: "Bone Stall", type: "LOCATION" as const },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn(), false]);
});

afterEach(() => cleanup());

describe("BulkFleshPanel", () => {
  it("is collapsed until the toggle is clicked, then lists the candidates", () => {
    render(<BulkFleshPanel campaignId="c1" candidates={CANDIDATES} />);
    expect(screen.queryByText("Mordecai")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /flesh out with ai/i }));
    expect(screen.getByText("Mordecai")).toBeTruthy();
    expect(screen.getByText("Bone Stall")).toBeTruthy();
    // Nothing selected yet — the submit button is disabled.
    expect((screen.getByRole("button", { name: /^flesh out$/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("selecting candidates updates the count and enables the submit button", () => {
    render(<BulkFleshPanel campaignId="c1" candidates={CANDIDATES} />);
    fireEvent.click(screen.getByRole("button", { name: /flesh out with ai/i }));

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("1 selected")).toBeTruthy();
    const submit = screen.getByRole("button", { name: /flesh out 1/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    // Toggling it back off disables the submit again.
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("0 selected")).toBeTruthy();
  });

  it("select-all checks every candidate, and clear-all unchecks them", () => {
    render(<BulkFleshPanel campaignId="c1" candidates={CANDIDATES} />);
    fireEvent.click(screen.getByRole("button", { name: /flesh out with ai/i }));

    fireEvent.click(screen.getByRole("button", { name: /select all/i }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect((screen.getAllByRole("checkbox") as HTMLInputElement[]).every((c) => c.checked)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(screen.getByText("0 selected")).toBeTruthy();
  });

  it("renders the success message, per-entity outcomes, and a queue link", () => {
    mockUseActionState.mockReturnValue([
      {
        success: "1 draft proposed (claude-opus-4-8), 1 skipped. Review it in the queue.",
        proposedCount: 1,
        skippedCount: 1,
        outcomes: [
          { entityName: "Mordecai", status: "proposed" as const },
          { entityName: "Bone Stall", status: "skipped" as const, detail: "This entity is locked." },
        ],
      },
      vi.fn(),
      false,
    ]);
    render(<BulkFleshPanel campaignId="c1" candidates={CANDIDATES} />);
    fireEvent.click(screen.getByRole("button", { name: /flesh out with ai/i }));

    expect(screen.getByText(/1 draft proposed/i)).toBeTruthy();
    expect(screen.getByText("This entity is locked.", { exact: false })).toBeTruthy();
    const link = screen.getByRole("link", { name: /Open Review Queue/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/campaigns/c1/review");
  });

  it("surfaces an error message", () => {
    mockUseActionState.mockReturnValue([
      { error: "No drafts were proposed — see the details below.", outcomes: [] },
      vi.fn(),
      false,
    ]);
    render(<BulkFleshPanel campaignId="c1" candidates={CANDIDATES} />);
    fireEvent.click(screen.getByRole("button", { name: /flesh out with ai/i }));
    expect(screen.getByRole("alert").textContent).toContain("No drafts were proposed");
  });
});
