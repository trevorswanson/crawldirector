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
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

import { GlobalSearchLink } from "@/components/console/global-search-link";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

  it("does not navigate to search when Enter is pressed without a query", () => {
    usePathnameMock.mockReturnValue("/campaigns/c1/entities/e9");
    render(<GlobalSearchLink />);

    fireEvent.keyDown(screen.getByLabelText("Search or ask the campaign"), { key: "Enter" });

    expect(pushMock).not.toHaveBeenCalled();
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

  it("closes the dropdown after footer links are clicked", () => {
    usePathnameMock.mockReturnValue("/campaigns/c1/entities/e9");
    render(<GlobalSearchLink />);

    const input = screen.getByLabelText("Search or ask the campaign");
    fireEvent.change(input, { target: { value: "mordecai" } });
    fireEvent.click(screen.getByRole("link", { name: /See all results/ }));
    expect(screen.queryByRole("link", { name: /See all results/ })).toBeNull();

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("link", { name: 'Ask the campaign "mordecai"' }));
    expect(screen.queryByRole("link", { name: 'Ask the campaign "mordecai"' })).toBeNull();
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

  it("ignores fulfilled preview results after the query changes", async () => {
    vi.useFakeTimers();
    usePathnameMock.mockReturnValue("/campaigns/c1/search");
    const first = deferred<Awaited<ReturnType<typeof searchCampaignPreviewAction>>>();
    const second = deferred<Awaited<ReturnType<typeof searchCampaignPreviewAction>>>();
    searchCampaignPreviewAction
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(<GlobalSearchLink />);
    const input = screen.getByLabelText("Search or ask the campaign");
    fireEvent.change(input, { target: { value: "mor" } });
    await act(async () => {
      vi.advanceTimersByTime(260);
      await Promise.resolve();
    });

    fireEvent.change(input, { target: { value: "mordecai" } });
    await act(async () => {
      vi.advanceTimersByTime(260);
      await Promise.resolve();
    });

    await act(async () => {
      first.resolve([
        { id: "old", label: "Old result", meta: "NPC", excerpt: null, href: "/old" },
      ]);
      await Promise.resolve();
    });
    expect(screen.queryByText("Old result")).toBeNull();

    await act(async () => {
      second.resolve([
        { id: "new", label: "Mordecai", meta: "NPC", excerpt: null, href: "/new" },
      ]);
      await Promise.resolve();
    });
    expect(screen.getByRole("link", { name: /Mordecai/ })).toBeTruthy();
  });

  it("ignores rejected preview results after the query changes", async () => {
    vi.useFakeTimers();
    usePathnameMock.mockReturnValue("/campaigns/c1/search");
    const first = deferred<Awaited<ReturnType<typeof searchCampaignPreviewAction>>>();
    const second = deferred<Awaited<ReturnType<typeof searchCampaignPreviewAction>>>();
    searchCampaignPreviewAction
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(<GlobalSearchLink />);
    const input = screen.getByLabelText("Search or ask the campaign");
    fireEvent.change(input, { target: { value: "mor" } });
    await act(async () => {
      vi.advanceTimersByTime(260);
      await Promise.resolve();
    });

    fireEvent.change(input, { target: { value: "mordecai" } });
    await act(async () => {
      vi.advanceTimersByTime(260);
      await Promise.resolve();
    });

    await act(async () => {
      first.reject(new Error("stale failure"));
      await Promise.resolve();
    });
    expect(screen.queryByText("Search unavailable.")).toBeNull();

    await act(async () => {
      second.resolve([
        { id: "new", label: "Mordecai", meta: "NPC", excerpt: null, href: "/new" },
      ]);
      await Promise.resolve();
    });
    expect(screen.getByRole("link", { name: /Mordecai/ })).toBeTruthy();
  });
});
