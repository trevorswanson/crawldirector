// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SystemFeed } from "@/components/crawler/system-feed";
import type { SystemFeedMessage } from "@/server/services/system-feed";

afterEach(cleanup);

function message(overrides: Partial<SystemFeedMessage> = {}): SystemFeedMessage {
  return {
    entityId: "m1",
    name: "Floor 9 collapses in 24 hours",
    summary: "The countdown begins.",
    description: "**Run**, crawlers.",
    tags: [],
    broadcastAt: new Date("2026-07-05T00:00:00Z"),
    ...overrides,
  };
}

describe("SystemFeed", () => {
  it("shows an honest empty note when there are no broadcasts", () => {
    render(<SystemFeed messages={[]} />);
    expect(screen.getByText(/No broadcasts yet/i)).toBeTruthy();
  });

  it("renders each message's headline, summary, and Markdown body", () => {
    render(<SystemFeed messages={[message()]} />);
    expect(screen.getByText("Floor 9 collapses in 24 hours")).toBeTruthy();
    expect(screen.getByText("The countdown begins.")).toBeTruthy();
    // Markdown emphasis renders as a <strong>, not literal asterisks.
    const strong = screen.getByText("Run");
    expect(strong.tagName).toBe("STRONG");
    // A machine-readable timestamp accompanies each broadcast.
    expect(document.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-07-05T00:00:00.000Z",
    );
  });

  it("omits the summary and body when a message carries neither", () => {
    render(
      <SystemFeed
        messages={[message({ summary: null, description: null })]}
      />,
    );
    expect(screen.getByText("Floor 9 collapses in 24 hours")).toBeTruthy();
    expect(screen.queryByText("The countdown begins.")).toBeNull();
  });

  it("orders nothing itself — it renders messages in the given order", () => {
    render(
      <SystemFeed
        messages={[
          message({ entityId: "a", name: "Newest" }),
          message({ entityId: "b", name: "Older" }),
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading");
    expect(headings.map((h) => h.textContent)).toEqual(["Newest", "Older"]);
  });
});
