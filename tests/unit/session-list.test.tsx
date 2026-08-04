// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { SessionList } from "@/components/sessions/session-list";
import type { SessionSummary } from "@/server/services/sessions";

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s1",
    title: "Session 12",
    playedAt: new Date("2026-08-04T00:00:00Z"),
    focus: "Floor 9",
    entryCount: 3,
    createdAt: new Date("2026-08-04T00:00:00Z"),
    ...overrides,
  };
}

describe("SessionList", () => {
  it("shows an empty note with no sessions", () => {
    render(<SessionList campaignId="c1" sessions={[]} />);
    expect(screen.getByText(/no sessions logged yet/i)).toBeTruthy();
  });

  it("renders each session's title, date, focus, and entry count, linked to its detail page", () => {
    render(<SessionList campaignId="c1" sessions={[session()]} />);
    const link = screen.getByRole("link", { name: /Session 12/ });
    expect(link.getAttribute("href")).toBe("/campaigns/c1/sessions/s1");
    expect(screen.getByText(/Floor 9/)).toBeTruthy();
    expect(screen.getByText("3 entries")).toBeTruthy();
  });

  it("shows Undated for a session with no playedAt and singular entry count", () => {
    render(<SessionList campaignId="c1" sessions={[session({ playedAt: null, focus: null, entryCount: 1 })]} />);
    expect(screen.getByText(/Undated/)).toBeTruthy();
    expect(screen.getByText("1 entry")).toBeTruthy();
  });
});
