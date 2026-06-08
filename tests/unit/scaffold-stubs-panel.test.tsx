// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { scaffoldStubsAction, mockUseActionState } = vi.hoisted(() => ({
  scaffoldStubsAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ scaffoldStubsAction }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import { ScaffoldStubsPanel } from "@/components/entities/scaffold-stubs-panel";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn(), false]);
});

afterEach(() => cleanup());

describe("ScaffoldStubsPanel", () => {
  it("is collapsed until the toggle is clicked", () => {
    render(<ScaffoldStubsPanel campaignId="c1" />);
    expect(screen.queryByPlaceholderText(/what should i scaffold/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /scaffold with ai/i }));
    expect(screen.getByPlaceholderText(/what should i scaffold/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /scaffold stubs/i })).toBeTruthy();
  });

  it("shows a success message with a link to the proposed change set", () => {
    mockUseActionState.mockReturnValue([
      { success: "3 stubs proposed (claude-opus-4-8). Review them in the queue.", changeSetId: "cs7" },
      vi.fn(),
      false,
    ]);
    render(<ScaffoldStubsPanel campaignId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: /scaffold with ai/i }));

    expect(screen.getByText(/3 stubs proposed/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Open Review Queue/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/campaigns/c1/review?selected=cs7");
  });

  it("surfaces an error message", () => {
    mockUseActionState.mockReturnValue([
      { error: "No AI provider is configured." },
      vi.fn(),
      false,
    ]);
    render(<ScaffoldStubsPanel campaignId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: /scaffold with ai/i }));
    expect(screen.getByRole("alert").textContent).toContain("No AI provider is configured.");
  });
});
