// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const {
  fleshOutEntityAction,
  inferRelationshipsForEntityAction,
  scaffoldStubsAction,
  fleshOutEntitiesAction,
  enqueueBulkFleshAction,
  mockUseActionState,
} = vi.hoisted(() => ({
  fleshOutEntityAction: vi.fn(),
  inferRelationshipsForEntityAction: vi.fn(),
  scaffoldStubsAction: vi.fn(),
  fleshOutEntitiesAction: vi.fn(),
  enqueueBulkFleshAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  fleshOutEntityAction,
  inferRelationshipsForEntityAction,
  scaffoldStubsAction,
  fleshOutEntitiesAction,
  enqueueBulkFleshAction,
}));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import { AiActionsDialog } from "@/components/entities/ai-actions-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn(), false]);
});

afterEach(cleanup);

describe("AiActionsDialog", () => {
  it("uses one icon-only trigger to place entity actions in a modal", () => {
    render(
      <AiActionsDialog variant="entity" campaignId="c1" entityId="e1" locked={false} />,
    );

    const trigger = screen.getByRole("button", { name: "AI actions" });
    expect(trigger.textContent).toBe("");
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "AI actions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /flesh out/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /infer relationships/i })).toBeTruthy();
  });

  it("places scaffold and bulk flesh-out controls in the World Browser modal", () => {
    render(
      <AiActionsDialog
        variant="world"
        campaignId="c1"
        candidates={[{ id: "e1", name: "Mordecai", type: "NPC" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI actions" }));

    expect(screen.getAllByText("Scaffold stubs")).toHaveLength(2);
    expect(screen.getByPlaceholderText(/what should i scaffold/i)).toBeTruthy();
    expect(screen.getByText("Bulk flesh-out")).toBeTruthy();
    expect(screen.getByText("Mordecai")).toBeTruthy();
  });
});
