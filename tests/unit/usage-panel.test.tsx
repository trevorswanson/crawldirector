// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { setSpendCapAction, mockUseActionState } = vi.hoisted(() => ({
  setSpendCapAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/campaigns/[id]/settings/actions", () => ({ setSpendCapAction }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import { UsagePanel } from "@/components/settings/usage-panel";
import type { CampaignAiUsage } from "@/server/services/ai-usage";

const baseUsage: CampaignAiUsage = {
  spendCapUsd: null,
  totalCostUsd: 0,
  runCount: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  unpricedRunCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn(), false]);
});

afterEach(() => cleanup());

describe("UsagePanel", () => {
  it("shows an empty state and 'no cap' when there are no runs", () => {
    render(<UsagePanel campaignId="c1" usage={baseUsage} />);
    expect(screen.getByText(/No generations yet/i)).toBeTruthy();
    expect(screen.getByText(/No cap set/i)).toBeTruthy();
    // The cap input is blank.
    const input = screen.getByLabelText(/spend cap/i) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("renders aggregate spend and token stats once runs exist", () => {
    render(
      <UsagePanel
        campaignId="c1"
        usage={{
          ...baseUsage,
          totalCostUsd: 1.5,
          runCount: 4,
          totalInputTokens: 12_345,
          totalOutputTokens: 6_789,
        }}
      />,
    );
    expect(screen.getByText("$1.50")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("12,345")).toBeTruthy();
    expect(screen.getByText("6,789")).toBeTruthy();
    expect(screen.queryByText(/No generations yet/i)).toBeNull();
  });

  it("reflects a configured cap and prefills the input", () => {
    render(<UsagePanel campaignId="c1" usage={{ ...baseUsage, spendCapUsd: 25 }} />);
    expect(screen.getByText(/Capped at \$25\.00/i)).toBeTruthy();
    const input = screen.getByLabelText(/spend cap/i) as HTMLInputElement;
    expect(input.value).toBe("25");
  });

  it("notes unpriced runs that are excluded from the estimate", () => {
    render(<UsagePanel campaignId="c1" usage={{ ...baseUsage, runCount: 2, unpricedRunCount: 1 }} />);
    expect(screen.getByText(/unpriced model/i)).toBeTruthy();
  });

  it("surfaces the action's success and error messages", () => {
    mockUseActionState.mockReturnValue([{ success: "Spend cap set to $5.00." }, vi.fn(), false]);
    const { rerender } = render(<UsagePanel campaignId="c1" usage={baseUsage} />);
    expect(screen.getByText("Spend cap set to $5.00.")).toBeTruthy();

    mockUseActionState.mockReturnValue([{ error: "The cap can't be negative." }, vi.fn(), false]);
    rerender(<UsagePanel campaignId="c1" usage={baseUsage} />);
    expect(screen.getByRole("alert").textContent).toMatch(/can't be negative/i);
  });
});
