// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const { usePathnameMock, pushMock, searchCampaignPreviewAction } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/dashboard"),
  pushMock: vi.fn(),
  searchCampaignPreviewAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/app/(dm)/actions", () => ({ searchCampaignPreviewAction }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { GlobalSearchLink } from "@/components/console/global-search-link";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("GlobalSearchLink", () => {
  it("is a disabled hint when not inside a campaign", () => {
    usePathnameMock.mockReturnValue("/dashboard");
    render(<GlobalSearchLink />);
    const el = screen.getByText(/Ask the Campaign/i).closest("[aria-disabled]");
    expect(el).not.toBeNull();
    expect(document.querySelector("a")).toBeNull();
  });

  it("opens an inline search box with results and an Ask handoff inside a campaign", async () => {
    vi.useFakeTimers();
    usePathnameMock.mockReturnValue("/campaigns/c1/entities/e9");
    searchCampaignPreviewAction.mockResolvedValue([
      {
        id: "ENTITY:e1",
        label: "Mordecai",
        meta: "NPC",
        excerpt: "Tutorial guild advisor",
        href: "/campaigns/c1/entities/e1",
      },
    ]);

    render(<GlobalSearchLink />);

    const input = screen.getByLabelText("Search or ask the campaign");
    fireEvent.change(input, { target: { value: "mordecai" } });
    await act(async () => {
      vi.advanceTimersByTime(260);
      await Promise.resolve();
    });

    expect(searchCampaignPreviewAction).toHaveBeenCalledWith("c1", "mordecai");
    expect(screen.getByRole("link", { name: /Mordecai/ }).getAttribute("href")).toBe(
      "/campaigns/c1/entities/e1",
    );
    expect(
      screen
        .getByRole("link", { name: 'Ask the campaign "mordecai"' })
        .getAttribute("href"),
    ).toBe("/campaigns/c1/ask?q=mordecai");
    expect(
      screen
        .getByRole("link", { name: /See all results/ })
        .getAttribute("href"),
    ).toBe("/campaigns/c1/search?q=mordecai");
  });

  it("navigates to the full search page when Enter is pressed", () => {
    usePathnameMock.mockReturnValue("/campaigns/c1/entities/e9");
    render(<GlobalSearchLink />);

    const input = screen.getByLabelText("Search or ask the campaign");
    fireEvent.change(input, { target: { value: "mordecai" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(pushMock).toHaveBeenCalledWith("/campaigns/c1/search?q=mordecai");
  });

  it("hides the dropdown when focus leaves the search box", () => {
    usePathnameMock.mockReturnValue("/campaigns/c1/entities/e9");
    render(<GlobalSearchLink />);

    const input = screen.getByLabelText("Search or ask the campaign");
    fireEvent.change(input, { target: { value: "mordecai" } });
    expect(screen.getByRole("link", { name: /See all results/ })).toBeTruthy();

    // Focus moves out of the box (relatedTarget defaults to null → outside).
    fireEvent.focusOut(input);
    expect(screen.queryByRole("link", { name: /See all results/ })).toBeNull();
  });

  it("shows a safe unavailable state when preview search fails", async () => {
    vi.useFakeTimers();
    usePathnameMock.mockReturnValue("/campaigns/c1/search");
    searchCampaignPreviewAction.mockRejectedValue(new Error("boom"));

    render(<GlobalSearchLink />);

    fireEvent.change(screen.getByLabelText("Search or ask the campaign"), {
      target: { value: "mordecai" },
    });
    await act(async () => {
      vi.advanceTimersByTime(260);
      await Promise.resolve();
    });

    expect(screen.getByText("Search unavailable.")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: 'Ask the campaign "mordecai"' })
        .getAttribute("href"),
    ).toBe("/campaigns/c1/ask?q=mordecai");
  });
});
