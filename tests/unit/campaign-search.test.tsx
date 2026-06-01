// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";

const { pushMock, usePathnameMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/campaigns/c1"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: usePathnameMock,
}));

import { CampaignSearch } from "@/components/entities/campaign-search";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CampaignSearch", () => {
  it("renders with initial query and updates state when typing", () => {
    render(<CampaignSearch initialQuery="initial" />);
    const input = screen.getByPlaceholderText(/Search entities/i) as HTMLInputElement;
    expect(input.value).toBe("initial");

    fireEvent.change(input, { target: { value: "new query" } });
    expect(input.value).toBe("new query");
  });

  it("debounces push transitions to the router", async () => {
    vi.useFakeTimers();
    render(<CampaignSearch initialQuery="" />);
    const input = screen.getByPlaceholderText(/Search entities/i);

    fireEvent.change(input, { target: { value: "test" } });

    // Should not call router push immediately
    expect(pushMock).not.toHaveBeenCalled();

    // Advance time by 200ms
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(pushMock).toHaveBeenCalledWith("/campaigns/c1?q=test");
    vi.useRealTimers();
  });

  it("retains existing filters in URL search params", async () => {
    vi.useFakeTimers();
    render(
      <CampaignSearch
        initialQuery=""
        activeType="NPC"
        activeStatus="CANON"
        activeSource="DM"
        lockedOnly={true}
      />
    );
    const input = screen.getByPlaceholderText(/Search entities/i);

    fireEvent.change(input, { target: { value: "hello" } });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(pushMock).toHaveBeenCalledWith(
      "/campaigns/c1?q=hello&type=NPC&status=CANON&source=DM&locked=1"
    );
    vi.useRealTimers();
  });

  it("syncs state when initialQuery prop changes", () => {
    const { rerender } = render(<CampaignSearch initialQuery="first" />);
    const input = screen.getByPlaceholderText(/Search entities/i) as HTMLInputElement;
    expect(input.value).toBe("first");

    rerender(<CampaignSearch initialQuery="second" />);
    expect(input.value).toBe("second");
  });
});
