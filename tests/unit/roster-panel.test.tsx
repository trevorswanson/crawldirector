// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { RosterPanel } from "@/components/entities/roster-panel";
import type { GroupRoster, RosterEntry } from "@/server/services/groups";

function entry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    relationshipId: "r1",
    relationshipType: "MEMBER_OF",
    locked: false,
    secret: false,
    entity: { id: "e1", name: "Carl", type: "NPC" },
    subRoster: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe("RosterPanel", () => {
  it("shows an empty state with no members", () => {
    const roster: GroupRoster = {
      group: { id: "g1", name: "The Guild", type: "GUILD" },
      leaders: [],
      members: [],
      rolledUpMemberCount: 0,
    };
    render(<RosterPanel campaignId="c1" roster={roster} />);
    expect(screen.getByText(/No members yet/i)).toBeTruthy();
    expect(screen.getByText(/0 members/i)).toBeTruthy();
  });

  it("renders leaders, members, and the rolled-up count", () => {
    const roster: GroupRoster = {
      group: { id: "g1", name: "The Guild", type: "GUILD" },
      leaders: [
        entry({
          relationshipId: "lead1",
          relationshipType: "LEADS",
          entity: { id: "leader", name: "Guildmaster", type: "NPC" },
        }),
      ],
      members: [
        entry({
          relationshipId: "m1",
          entity: { id: "carl", name: "Carl", type: "NPC" },
        }),
      ],
      rolledUpMemberCount: 1,
    };
    render(<RosterPanel campaignId="c1" roster={roster} />);

    expect(screen.getByText(/1 member\b/i)).toBeTruthy();
    expect(screen.getByText("Leaders")).toBeTruthy();
    expect(screen.getByText("Members")).toBeTruthy();
    expect(screen.getByText("Guildmaster")).toBeTruthy();

    const carl = screen.getByText("Carl");
    expect(carl.getAttribute("href")).toBe("/campaigns/c1/entities/carl");
  });

  it("nests a sub-group's roster and flags secret/locked members", () => {
    const roster: GroupRoster = {
      group: { id: "g1", name: "The Guild", type: "GUILD" },
      leaders: [],
      members: [
        entry({
          relationshipId: "party1",
          entity: { id: "party", name: "Princess Party", type: "PARTY" },
          subRoster: {
            group: { id: "party", name: "Princess Party", type: "PARTY" },
            leaders: [],
            members: [
              entry({
                relationshipId: "m1",
                secret: true,
                locked: true,
                entity: { id: "carl", name: "Carl", type: "NPC" },
              }),
            ],
            rolledUpMemberCount: 1,
          },
        }),
      ],
      rolledUpMemberCount: 1,
    };
    render(<RosterPanel campaignId="c1" roster={roster} />);

    expect(screen.getByText("Princess Party")).toBeTruthy();
    const carl = screen.getByText("Carl");
    // secret marker and lock icon live in the same row as the member
    const row = carl.closest("div");
    expect(row).not.toBeNull();
    if (row) {
      expect(within(row).getByText("secret")).toBeTruthy();
    }
  });

  it("renders a nested leader and an empty sub-group message", () => {
    const roster: GroupRoster = {
      group: { id: "g1", name: "The Guild", type: "GUILD" },
      leaders: [],
      members: [
        // sub-group with a leader but no members → nested leader row renders
        entry({
          relationshipId: "party1",
          entity: { id: "led", name: "Led Party", type: "PARTY" },
          subRoster: {
            group: { id: "led", name: "Led Party", type: "PARTY" },
            leaders: [
              entry({
                relationshipId: "lead1",
                relationshipType: "LEADS",
                entity: { id: "cap", name: "Captain", type: "NPC" },
              }),
            ],
            members: [],
            rolledUpMemberCount: 0,
          },
        }),
        // fully empty sub-group → "No members yet." appears beneath it
        entry({
          relationshipId: "party2",
          entity: { id: "vacant", name: "Vacant Party", type: "PARTY" },
          subRoster: {
            group: { id: "vacant", name: "Vacant Party", type: "PARTY" },
            leaders: [],
            members: [],
            rolledUpMemberCount: 0,
          },
        }),
      ],
      rolledUpMemberCount: 0,
    };
    render(<RosterPanel campaignId="c1" roster={roster} />);

    expect(screen.getByText("Led Party")).toBeTruthy();
    expect(screen.getByText("Captain")).toBeTruthy();
    expect(screen.getByText("Vacant Party")).toBeTruthy();
    expect(screen.getByText(/No members yet/i)).toBeTruthy();
  });
});
