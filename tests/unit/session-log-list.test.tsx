// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { promoteSessionLogEntryAction } = vi.hoisted(() => ({
  promoteSessionLogEntryAction: vi.fn(),
}));
vi.mock("@/app/(dm)/actions", () => ({ promoteSessionLogEntryAction }));

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

afterEach(() => cleanup());

describe("SessionLogList", () => {
  it("shows an empty note with no entries", () => {
    render(<SessionLogList campaignId="c1" sessionId="s1" entries={[]} />);
    expect(screen.getByText(/no log entries yet/i)).toBeTruthy();
  });

  it("renders entry text and tagged entities as links to their detail pages", () => {
    render(
      <SessionLogList
        campaignId="c1"
        sessionId="s1"
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
        sessionId="s1"
        entries={[entry({ id: "e1", text: "First" }), entry({ id: "e2", text: "Second" })]}
      />,
    );
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows a promote-to-event affordance for an unpromoted entry", () => {
    render(<SessionLogList campaignId="c1" sessionId="s1" entries={[entry()]} />);
    expect(screen.getByRole("button", { name: /promote to event/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /view event/i })).toBeNull();
  });

  it("shows a link to the Timeline for an already-promoted entry, not the promote button", () => {
    render(
      <SessionLogList
        campaignId="c1"
        sessionId="s1"
        entries={[entry({ promotedEventId: "ev1" })]}
      />,
    );
    const link = screen.getByRole("link", { name: /promoted.*view event/i });
    expect(link.getAttribute("href")).toBe("/campaigns/c1/timeline?event=ev1");
    expect(screen.queryByRole("button", { name: /promote to event/i })).toBeNull();
  });
});
