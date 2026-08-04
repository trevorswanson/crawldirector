// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { SessionLogList } from "@/components/sessions/session-log-list";
import type { SessionLogEntryView } from "@/server/services/sessions";

function entry(overrides: Partial<SessionLogEntryView> = {}): SessionLogEntryView {
  return {
    id: "e1",
    at: new Date("2026-08-04T20:00:00Z"),
    text: "Donut insulted the Maestro on air",
    taggedEntities: [],
    promotedEventId: null,
    ...overrides,
  };
}

describe("SessionLogList", () => {
  it("shows an empty note with no entries", () => {
    render(<SessionLogList campaignId="c1" entries={[]} />);
    expect(screen.getByText(/no log entries yet/i)).toBeTruthy();
  });

  it("renders entry text and tagged entities as links to their detail pages", () => {
    render(
      <SessionLogList
        campaignId="c1"
        entries={[
          entry({ taggedEntities: [{ id: "npc1", name: "Carl", type: "NPC" }] }),
        ]}
      />,
    );
    expect(screen.getByText("Donut insulted the Maestro on air")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Carl/ });
    expect(link.getAttribute("href")).toBe("/campaigns/c1/entities/npc1");
  });

  it("renders multiple entries with no tag section when untagged", () => {
    render(
      <SessionLogList
        campaignId="c1"
        entries={[entry({ id: "e1", text: "First" }), entry({ id: "e2", text: "Second" })]}
      />,
    );
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
