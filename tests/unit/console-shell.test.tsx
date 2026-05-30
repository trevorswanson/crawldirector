// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { usePathname } = vi.hoisted(() => ({
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/app/(dm)/actions", () => ({
  getCampaignCanonIntegrityAction: vi.fn().mockResolvedValue({
    dmPercent: 64,
    aiPercent: 22,
    playerPercent: 0,
    lockedPercent: 14,
    dmCount: 64,
    aiCount: 22,
    playerCount: 0,
    lockedCount: 14,
    totalFields: 100,
  }),
}));

import { DmNav } from "@/components/console/dm-nav";
import { CampaignSwitcher } from "@/components/console/campaign-switcher";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ campaigns: [] }),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DmNav", () => {
  it("keeps the world browser link scoped to the current campaign", () => {
    usePathname.mockReturnValue("/campaigns/c1/entities/e1");

    render(<DmNav />);

    expect(screen.getByRole("link", { name: /World Browser/ }).getAttribute("href")).toBe(
      "/campaigns/c1",
    );
  });

  it("links world browser to the campaign picker when no campaign is active", () => {
    usePathname.mockReturnValue("/dashboard");

    render(<DmNav />);

    expect(screen.getByRole("link", { name: /World Browser/ }).getAttribute("href")).toBe(
      "/dashboard",
    );
  });

  it("renders the canon integrity meter when a campaign is active", async () => {
    usePathname.mockReturnValue("/campaigns/c1");

    render(<DmNav />);

    await waitFor(() => {
      expect(screen.getByText("Canon integrity")).toBeDefined();
    });

    expect(screen.getByText(/64% DM · 22% AI-origin · 14% locked/)).toBeDefined();
  });
});

describe("CampaignSwitcher", () => {
  const campaigns = [
    { id: "c1", name: "Floor One" },
    { id: "c2", name: "Faction Wars" },
  ];

  it("shows the active campaign and lists every campaign plus the new crawl link", () => {
    usePathname.mockReturnValue("/campaigns/c2/entities/e1");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ campaigns }),
    } as Response);

    render(<CampaignSwitcher campaigns={campaigns} />);

    expect(screen.getByLabelText("Switch campaign").textContent).toContain(
      "Faction Wars",
    );
    fireEvent.click(screen.getByLabelText("Switch campaign"));
    expect(screen.getByRole("link", { name: "Floor One" }).getAttribute("href")).toBe(
      "/campaigns/c1",
    );
    expect(screen.getByRole("link", { name: "Faction Wars" }).getAttribute("href")).toBe(
      "/campaigns/c2",
    );
    expect(
      screen.getByRole("link", { name: "Start New Crawl" }).getAttribute("href"),
    ).toBe("/dashboard#new-crawl");
  });

  it("falls back to the campaigns label outside a campaign", () => {
    usePathname.mockReturnValue("/dashboard");

    render(<CampaignSwitcher campaigns={campaigns} />);

    expect(screen.getByLabelText("Switch campaign").textContent).toContain("Campaigns");
  });

  it("refreshes stale campaign props after route changes", async () => {
    usePathname.mockReturnValue("/campaigns/c2");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ campaigns }),
    } as Response);

    render(<CampaignSwitcher campaigns={[]} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Switch campaign").textContent).toContain(
        "Faction Wars",
      );
    });
  });

  it("closes when focus leaves the switcher", () => {
    usePathname.mockReturnValue("/campaigns/c2");

    render(
      <>
        <CampaignSwitcher campaigns={campaigns} />
        <button type="button">Outside</button>
      </>,
    );

    const switcher = screen.getByLabelText("Switch campaign");
    const details = switcher.closest("details");
    fireEvent.click(switcher);
    expect(details?.hasAttribute("open")).toBe(true);

    fireEvent.blur(switcher, { relatedTarget: screen.getByRole("button", { name: "Outside" }) });

    expect(details?.hasAttribute("open")).toBe(false);
  });

  it("closes on route changes", async () => {
    usePathname.mockReturnValue("/campaigns/c2");
    const { rerender } = render(<CampaignSwitcher campaigns={campaigns} />);

    const switcher = screen.getByLabelText("Switch campaign");
    const details = switcher.closest("details");
    fireEvent.click(switcher);
    expect(details?.hasAttribute("open")).toBe(true);

    usePathname.mockReturnValue("/campaigns/c1");
    rerender(<CampaignSwitcher campaigns={campaigns} />);

    await waitFor(() => {
      expect(details?.hasAttribute("open")).toBe(false);
    });
  });
});
