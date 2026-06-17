// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { usePathnameMock, getCampaignHeaderStatusAction } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/dashboard"),
  getCampaignHeaderStatusAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
vi.mock("@/app/(dm)/actions", () => ({
  getCampaignHeaderStatusAction,
}));

import { GlobalCampaignStatus } from "@/components/console/global-campaign-status";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GlobalCampaignStatus", () => {
  it("renders nothing and does not fetch outside a campaign", () => {
    usePathnameMock.mockReturnValue("/dashboard");

    const { container } = render(<GlobalCampaignStatus />);

    expect(container.textContent).toBe("");
    expect(getCampaignHeaderStatusAction).not.toHaveBeenCalled();
  });

  it("renders the current floor and current day inside a campaign", async () => {
    usePathnameMock.mockReturnValue("/campaigns/c1/entities/e1");
    getCampaignHeaderStatusAction.mockResolvedValue({
      currentFloor: { id: "f9", name: "Larracos", floorNumber: 9 },
      currentDay: 52,
    });

    render(<GlobalCampaignStatus />);

    await waitFor(() => {
      expect(screen.getByLabelText("Campaign status").textContent).toContain(
        "Floor 9 · Day 52",
      );
    });
    expect(getCampaignHeaderStatusAction).toHaveBeenCalledWith("c1");
  });
});
