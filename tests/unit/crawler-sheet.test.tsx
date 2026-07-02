// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CrawlerSheetPanel } from "@/components/crawler/crawler-sheet";
import type { CrawlerSheet } from "@/server/services/crawlers";

afterEach(cleanup);

const sheet = (over: Partial<CrawlerSheet> = {}): CrawlerSheet => ({
  entityId: "e1",
  name: "Carl",
  summary: null,
  imageUrl: null,
  realName: null,
  crawlerNo: "4,722,644,976",
  level: 7,
  hp: 42,
  mp: 12,
  gold: 300,
  currentFloor: 9,
  isAlive: true,
  killCount: 5,
  followerCount: BigInt(1200),
  stats: {},
  ...over,
});

describe("CrawlerSheetPanel", () => {
  it("renders identity, vitals, and fame from real fields", () => {
    render(<CrawlerSheetPanel sheet={sheet()} />);
    expect(screen.getByText("Carl")).toBeTruthy();
    expect(screen.getByText(/4,722,644,976 · LVL 7/)).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy(); // HP
    expect(screen.getByText("12")).toBeTruthy(); // MP
    expect(screen.getByText("300")).toBeTruthy(); // gold
    expect(screen.getByText("9")).toBeTruthy(); // floor
    expect(screen.getByText(/5 kills/)).toBeTruthy();
    expect(screen.getByText(/1,200 watching/)).toBeTruthy();
  });

  it("falls back to an initial when there is no image, and shows real name", () => {
    render(<CrawlerSheetPanel sheet={sheet({ realName: "Carl Wracks" })} />);
    expect(screen.getByText("C")).toBeTruthy();
    expect(screen.getByText("Carl Wracks")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("renders an avatar image when imageUrl is set", () => {
    render(<CrawlerSheetPanel sheet={sheet({ imageUrl: "https://x/y.png" })} />);
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "https://x/y.png",
    );
  });

  it("omits the stat grid when there are no stats (no filler)", () => {
    render(<CrawlerSheetPanel sheet={sheet()} />);
    expect(screen.queryByText("STR")).toBeNull();
  });

  it("renders the stat grid only when populated", () => {
    render(<CrawlerSheetPanel sheet={sheet({ stats: { STR: 80, DEX: 40 } })} />);
    expect(screen.getByText("STR")).toBeTruthy();
    expect(screen.getByText("80")).toBeTruthy();
    expect(screen.getByText("DEX")).toBeTruthy();
  });

  it("shows a Fallen badge for a dead crawler", () => {
    render(<CrawlerSheetPanel sheet={sheet({ isAlive: false })} />);
    expect(screen.getByText("Fallen")).toBeTruthy();
  });

  it("renders em-dashes for absent HP/MP/floor rather than fabricating zeros", () => {
    render(
      <CrawlerSheetPanel
        sheet={sheet({ hp: null, mp: null, currentFloor: null })}
      />,
    );
    // Three em-dash readouts (HP, MP, Floor).
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
