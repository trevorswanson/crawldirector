// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SuggestionList } from "@/components/crawler/suggestion-list";
import type { MySuggestion } from "@/server/services/review";

afterEach(cleanup);

function suggestion(over: Partial<MySuggestion> = {}): MySuggestion {
  return {
    id: "cs1",
    title: "Suggestion for Carl",
    status: "PENDING",
    createdAt: new Date("2026-01-01"),
    reviewedAt: null,
    reviewNotes: null,
    ...over,
  };
}

describe("SuggestionList", () => {
  it("shows a single honest empty state when there are no suggestions", () => {
    render(<SuggestionList suggestions={[]} />);
    expect(screen.getByText(/haven't submitted a suggestion yet/i)).toBeTruthy();
  });

  it("renders a pending suggestion with its title and status", () => {
    render(<SuggestionList suggestions={[suggestion()]} />);
    expect(screen.getByText("Suggestion for Carl")).toBeTruthy();
    expect(screen.getByText("Pending review")).toBeTruthy();
  });

  it("renders a reviewed suggestion's review date and notes", () => {
    render(
      <SuggestionList
        suggestions={[
          suggestion({
            status: "REJECTED",
            reviewedAt: new Date("2026-01-05"),
            reviewNotes: "Doesn't fit the current arc.",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Rejected")).toBeTruthy();
    expect(screen.getByText(/reviewed/i)).toBeTruthy();
    expect(screen.getByText(/doesn't fit the current arc/i)).toBeTruthy();
  });

  it("renders multiple suggestions in the given order", () => {
    render(
      <SuggestionList
        suggestions={[
          suggestion({ id: "cs1", title: "First" }),
          suggestion({ id: "cs2", title: "Second", status: "APPROVED" }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("First");
    expect(items[1].textContent).toContain("Second");
  });
});
