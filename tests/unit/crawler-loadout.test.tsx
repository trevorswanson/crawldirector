// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CrawlerLoadoutPanel } from "@/components/crawler/crawler-loadout";
import type { CrawlerLoadout } from "@/server/services/crawlers";

afterEach(cleanup);

const empty: CrawlerLoadout = {
  items: [],
  lootBoxes: [],
  achievements: [],
  titles: [],
};

describe("CrawlerLoadoutPanel", () => {
  it("shows a single honest note when the loadout is empty", () => {
    render(<CrawlerLoadoutPanel loadout={empty} />);
    expect(screen.getByText(/No inventory, loot boxes, achievements/i)).toBeTruthy();
  });

  it("renders only the sections that have entries", () => {
    render(
      <CrawlerLoadoutPanel
        loadout={{
          ...empty,
          items: [{ entityId: "i1", name: "Vorpal Sword", type: "ITEM", summary: "Snicker-snack" }],
          titles: [{ entityId: "t1", name: "Goblin Slayer", type: "TITLE", summary: null }],
        }}
      />,
    );
    expect(screen.getByText("Inventory")).toBeTruthy();
    expect(screen.getByText("Vorpal Sword")).toBeTruthy();
    expect(screen.getByText("Snicker-snack")).toBeTruthy();
    expect(screen.getByText("Titles")).toBeTruthy();
    expect(screen.getByText("Goblin Slayer")).toBeTruthy();
    // Sections with no entries are absent (no filler).
    expect(screen.queryByText("Loot Boxes")).toBeNull();
    expect(screen.queryByText("Achievements")).toBeNull();
  });

  it("renders a loot box with its source achievement and contents", () => {
    render(
      <CrawlerLoadoutPanel
        loadout={{
          ...empty,
          lootBoxes: [
            {
              entityId: "b1",
              name: "Bronze Box",
              type: "BOX",
              summary: null,
              fromAchievement: "First Blood",
              contents: [
                { entityId: "c1", name: "Health Potion", type: "ITEM", summary: null },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Loot Boxes")).toBeTruthy();
    expect(screen.getByText("Bronze Box")).toBeTruthy();
    expect(screen.getByText(/from First Blood/i)).toBeTruthy();
    expect(screen.getByText("Health Potion")).toBeTruthy();
  });
});
