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
import { getCampaignCanonIntegrityAction } from "@/app/(dm)/actions";

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
  it("keeps the world browser link scoped to the current campaign", async () => {
    usePathname.mockReturnValue("/campaigns/c1/entities/e1");

    render(<DmNav />);

    expect(screen.getByRole("link", { name: /World Browser/ }).getAttribute("href")).toBe(
      "/campaigns/c1",
    );
    await waitFor(() => {});
  });

  it("links the relationship graph to the current campaign and highlights it", async () => {
    usePathname.mockReturnValue("/campaigns/c1/graph");

    render(<DmNav />);

    const link = screen.getByRole("link", { name: /Relationship Graph/ });
    expect(link.getAttribute("href")).toBe("/campaigns/c1/graph");
    await waitFor(() => {});
  });

  it("links the campaign timeline to the current campaign and highlights it", async () => {
    usePathname.mockReturnValue("/campaigns/c1/timeline");

    render(<DmNav />);

    const link = screen.getByRole("link", { name: /Timeline/ });
    expect(link.getAttribute("href")).toBe("/campaigns/c1/timeline");
    await waitFor(() => {});
  });

  it("links Ask the Campaign to the current campaign and highlights it", async () => {
    usePathname.mockReturnValue("/campaigns/c1/ask");

    render(<DmNav />);

    const link = screen.getByRole("link", { name: /Ask the Campaign/ });
    expect(link.getAttribute("href")).toBe("/campaigns/c1/ask");
    await waitFor(() => {});
  });

  it("links the job queue to the current campaign and highlights it", async () => {
    usePathname.mockReturnValue("/campaigns/c1/jobs");

    render(<DmNav />);

    const link = screen.getByRole("link", { name: /Job Queue/ });
    expect(link.getAttribute("href")).toBe("/campaigns/c1/jobs");
    await waitFor(() => {});
  });

  it("links world browser to the campaign picker when no campaign is active", async () => {
    usePathname.mockReturnValue("/dashboard");

    render(<DmNav />);

    expect(screen.getByRole("link", { name: /World Browser/ }).getAttribute("href")).toBe(
      "/dashboard",
    );
    await waitFor(() => {});
  });

  it("renders the canon integrity meter when a campaign is active", async () => {
    usePathname.mockReturnValue("/campaigns/c1");

    render(<DmNav />);

    await waitFor(() => {
      expect(screen.getByText("Canon integrity")).toBeDefined();
    });

    expect(screen.getByText(/64% DM · 22% AI-origin · 14% locked/)).toBeDefined();
  });

  it("shows unbuilt sections as disabled roadmap entries", async () => {
    usePathname.mockReturnValue("/dashboard");

    render(<DmNav />);

    const planned = screen.getByTitle(/M6 — System AI persona engine/);
    expect(planned.getAttribute("aria-disabled")).toBe("true");
    expect(planned.textContent).toContain("Planned");
    await waitFor(() => {});
  });

  it("logs and recovers when canon integrity fails to load", async () => {
    usePathname.mockReturnValue("/campaigns/c1");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getCampaignCanonIntegrityAction).mockRejectedValueOnce(
      new Error("boom"),
    );

    render(<DmNav />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Error loading canon integrity:",
        expect.any(Error),
      );
    });
    // The meter never appears, but the nav still renders.
    expect(screen.queryByText("Canon integrity")).toBeNull();
    expect(screen.getByRole("link", { name: /World Browser/ })).toBeDefined();

    errorSpy.mockRestore();
  });
});

describe("CampaignSwitcher", () => {
  const campaigns = [
    { id: "c1", name: "Floor One" },
    { id: "c2", name: "Faction Wars" },
  ];

  it("shows the active campaign and lists every campaign plus the new crawl link", async () => {
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
    await waitFor(() => {});
  });

  it("falls back to the campaigns label outside a campaign", async () => {
    usePathname.mockReturnValue("/dashboard");

    render(<CampaignSwitcher campaigns={campaigns} />);

    expect(screen.getByLabelText("Switch campaign").textContent).toContain("Campaigns");
    await waitFor(() => {});
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

  it("closes when focus leaves the switcher", async () => {
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
    await waitFor(() => {});
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
