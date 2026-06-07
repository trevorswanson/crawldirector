// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { fleshOutEntityAction, inferRelationshipsForEntityAction, mockUseActionState } = vi.hoisted(() => ({
  fleshOutEntityAction: vi.fn(),
  inferRelationshipsForEntityAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ fleshOutEntityAction, inferRelationshipsForEntityAction }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import { GeneratePanel } from "@/components/entities/generate-panel";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn(), false]);
});

afterEach(() => cleanup());

describe("GeneratePanel", () => {
  it("renders the flesh-out control with an explanatory blurb", () => {
    render(<GeneratePanel campaignId="c1" entityId="e1" locked={false} />);
    expect(screen.getByText("AI generation")).toBeTruthy();
    expect(screen.getByRole("button", { name: /flesh out/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /infer relationships/i })).toBeTruthy();
    expect(screen.getByText(/Review Queue as a proposal/i)).toBeTruthy();
  });

  it("disables the buttons when the entity is locked", () => {
    render(<GeneratePanel campaignId="c1" entityId="e1" locked />);
    const flesh = screen.getByRole("button", { name: /flesh out/i }) as HTMLButtonElement;
    const infer = screen.getByRole("button", { name: /infer relationships/i }) as HTMLButtonElement;
    expect(flesh.disabled).toBe(true);
    expect(infer.disabled).toBe(true);
  });

  it("shows a success message with a link to the proposed change set", () => {
    mockUseActionState
      .mockReturnValueOnce([
        { success: "Draft proposed (claude-opus-4-8). Review it in the queue.", changeSetId: "cs9" },
        vi.fn(),
        false,
      ])
      .mockReturnValueOnce([undefined, vi.fn(), false]);
    render(<GeneratePanel campaignId="c1" entityId="e1" locked={false} />);
    expect(screen.getByText(/Draft proposed/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Open Review Queue/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/campaigns/c1/review?selected=cs9");
  });

  it("surfaces an error message", () => {
    mockUseActionState
      .mockReturnValueOnce([{ error: "No AI provider is configured." }, vi.fn(), false])
      .mockReturnValueOnce([undefined, vi.fn(), false]);
    render(<GeneratePanel campaignId="c1" entityId="e1" locked={false} />);
    expect(screen.getByRole("alert").textContent).toContain("No AI provider is configured.");
  });

  it("shows a relationship-inference success message with a link to the proposed change set", () => {
    mockUseActionState
      .mockReturnValueOnce([undefined, vi.fn(), false])
      .mockReturnValueOnce([
        { success: "2 relationships proposed (claude-opus-4-8). Review them in the queue.", changeSetId: "cs10" },
        vi.fn(),
        false,
      ]);
    render(<GeneratePanel campaignId="c1" entityId="e1" locked={false} />);
    expect(screen.getByText(/2 relationships proposed/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Open relationship proposals/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/campaigns/c1/review?selected=cs10");
  });
});
