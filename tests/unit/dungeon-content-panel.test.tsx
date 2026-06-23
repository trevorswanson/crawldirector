// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { generateDungeonContentAction, mockUseActionState } = vi.hoisted(() => ({
  generateDungeonContentAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ generateDungeonContentAction }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import { DungeonContentPanel } from "@/components/entities/dungeon-content-panel";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn(), false]);
});

afterEach(() => cleanup());

describe("DungeonContentPanel", () => {
  it("renders the kind selector with the persona-voiced creatable kinds and a brief field", () => {
    render(<DungeonContentPanel campaignId="c1" />);

    const select = screen.getByRole("combobox", { name: /kind/i }) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual([
      "BOSS",
      "MOB_TYPE",
      "ITEM",
      "SYSTEM_MESSAGE",
      "ACHIEVEMENT",
      "TITLE",
    ]);
    // Boss is the default.
    expect(select.value).toBe("BOSS");
    expect(screen.getByPlaceholderText(/what should the system ai create/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /generate/i })).toBeTruthy();
  });

  it("shows a success message with a link to the proposed change set", () => {
    mockUseActionState.mockReturnValue([
      { success: "Proposed “The Maitre D'” (claude-opus-4-8). Review it in the queue.", changeSetId: "cs9" },
      vi.fn(),
      false,
    ]);
    render(<DungeonContentPanel campaignId="c1" />);

    expect(screen.getByText(/Proposed/i).textContent).toContain("The Maitre D'");
    const link = screen.getByRole("link", { name: /Open Review Queue/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/campaigns/c1/review?selected=cs9");
  });

  it("surfaces an error message", () => {
    mockUseActionState.mockReturnValue([
      { error: "No AI provider is configured." },
      vi.fn(),
      false,
    ]);
    render(<DungeonContentPanel campaignId="c1" />);
    expect(screen.getByRole("alert").textContent).toContain("No AI provider is configured.");
  });
});
