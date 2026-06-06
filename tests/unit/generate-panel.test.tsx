// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { fleshOutEntityAction, mockUseActionState } = vi.hoisted(() => ({
  fleshOutEntityAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ fleshOutEntityAction }));
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
    expect(screen.getByText(/Review Queue as a proposal/i)).toBeTruthy();
  });

  it("disables the button when the entity is locked", () => {
    render(<GeneratePanel campaignId="c1" entityId="e1" locked />);
    const btn = screen.getByRole("button", { name: /flesh out/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("shows a success message with a link to the proposed change set", () => {
    mockUseActionState.mockReturnValue([
      { success: "Draft proposed (claude-opus-4-8). Review it in the queue.", changeSetId: "cs9" },
      vi.fn(),
      false,
    ]);
    render(<GeneratePanel campaignId="c1" entityId="e1" locked={false} />);
    expect(screen.getByText(/Draft proposed/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Open Review Queue/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/campaigns/c1/review?selected=cs9");
  });

  it("surfaces an error message", () => {
    mockUseActionState.mockReturnValue([
      { error: "No AI provider is configured." },
      vi.fn(),
      false,
    ]);
    render(<GeneratePanel campaignId="c1" entityId="e1" locked={false} />);
    expect(screen.getByRole("alert").textContent).toContain("No AI provider is configured.");
  });
});
