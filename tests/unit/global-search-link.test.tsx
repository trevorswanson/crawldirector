// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/dashboard"),
}));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
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
});

describe("GlobalSearchLink", () => {
  it("is a disabled hint when not inside a campaign", () => {
    usePathnameMock.mockReturnValue("/dashboard");
    render(<GlobalSearchLink />);
    const el = screen.getByText(/Ask the Campaign/i).closest("[aria-disabled]");
    expect(el).not.toBeNull();
    expect(document.querySelector("a")).toBeNull();
  });

  it("links to the campaign search page when inside a campaign", () => {
    usePathnameMock.mockReturnValue("/campaigns/c1/entities/e9");
    render(<GlobalSearchLink />);
    const link = screen.getByText(/Ask the Campaign/i).closest("a");
    expect(link?.getAttribute("href")).toBe("/campaigns/c1/search");
  });
});
