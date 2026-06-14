// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { SearchBar } from "@/components/search/search-bar";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SearchBar", () => {
  it("renders the initial query and updates on typing", () => {
    render(<SearchBar campaignId="c1" initialQuery="carl" />);
    const input = screen.getByLabelText("Search canon") as HTMLInputElement;
    expect(input.value).toBe("carl");
    fireEvent.change(input, { target: { value: "donut" } });
    expect(input.value).toBe("donut");
  });

  it("debounces a push to the campaign search route", () => {
    vi.useFakeTimers();
    render(<SearchBar campaignId="c1" initialQuery="" />);
    const input = screen.getByLabelText("Search canon");

    fireEvent.change(input, { target: { value: "goblin" } });
    expect(pushMock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(200));
    expect(pushMock).toHaveBeenCalledWith("/campaigns/c1/search?q=goblin");
    vi.useRealTimers();
  });

  it("pushes a bare path when the query is cleared", () => {
    vi.useFakeTimers();
    render(<SearchBar campaignId="c1" initialQuery="goblin" />);
    const input = screen.getByLabelText("Search canon");

    fireEvent.change(input, { target: { value: "   " } });
    act(() => vi.advanceTimersByTime(200));
    expect(pushMock).toHaveBeenCalledWith("/campaigns/c1/search");
    vi.useRealTimers();
  });

  it("syncs the field when initialQuery changes (back/forward nav)", () => {
    const { rerender } = render(<SearchBar campaignId="c1" initialQuery="first" />);
    const input = screen.getByLabelText("Search canon") as HTMLInputElement;
    expect(input.value).toBe("first");
    rerender(<SearchBar campaignId="c1" initialQuery="second" />);
    expect(input.value).toBe("second");
  });
});
