// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { askCampaignAction, mockUseActionState } = vi.hoisted(() => ({
  askCampaignAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ askCampaignAction }));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import { AskPanel } from "@/components/ask/ask-panel";
import type { AskActionState } from "@/app/(dm)/actions";

function mockState(state: AskActionState) {
  mockUseActionState.mockImplementation(() => [state, vi.fn(), false]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState(undefined);
});

afterEach(() => cleanup());

const SOURCES = [
  {
    index: 1,
    cited: true,
    targetType: "ENTITY" as const,
    targetId: "e1",
    kind: "NPC",
    label: "The Maestro",
    href: "/campaigns/c1/entities/e1",
  },
  {
    index: 2,
    cited: false,
    targetType: "EVENT" as const,
    targetId: "ev1",
    kind: "Event",
    label: "Floor 9 siege",
    href: "/campaigns/c1/timeline",
  },
];

describe("AskPanel", () => {
  it("renders the question form with a read-only note and no answer yet", () => {
    render(<AskPanel campaignId="c1" />);
    expect(screen.getByLabelText(/ask the campaign a question/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^ask$/i })).toBeTruthy();
    expect(screen.getByText(/never saved as canon/i)).toBeTruthy();
  });

  it("prefills and submits an initial question from search handoff", async () => {
    const action = vi.fn();
    mockUseActionState.mockImplementation(() => [undefined, action, false]);

    render(<AskPanel campaignId="c1" initialQuestion="Who knows Mordecai?" />);

    expect(
      (screen.getByLabelText(/ask the campaign a question/i) as HTMLTextAreaElement).value,
    ).toBe("Who knows Mordecai?");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][0].get("question")).toBe("Who knows Mordecai?");
  });

  it("renders a grounded answer with the cited marker linked and a sources list", () => {
    mockState({
      answer: "The Maestro pulls the strings [1].",
      grounded: true,
      sources: SOURCES,
      model: "claude-opus-4-8",
      timestamp: 1,
    });
    render(<AskPanel campaignId="c1" />);

    // The [1] in the answer is a link to the cited source.
    const citation = screen.getByRole("link", { name: "[1]" });
    expect(citation.getAttribute("href")).toBe("/campaigns/c1/entities/e1");

    // The sources list shows both retrieved sources, marking the cited one.
    expect(screen.getByText("The Maestro")).toBeTruthy();
    expect(screen.getByText("Floor 9 siege")).toBeTruthy();
    expect(screen.getByText(/^Cited$/)).toBeTruthy();
    expect(screen.getByText("claude-opus-4-8")).toBeTruthy();
  });

  it("renders an ungrounded answer with no sources list", () => {
    mockState({
      answer: "I couldn't find anything in this campaign's canon to answer that.",
      grounded: false,
      sources: [],
      model: null,
      timestamp: 1,
    });
    render(<AskPanel campaignId="c1" />);
    expect(screen.getByText(/couldn't find anything/i)).toBeTruthy();
    expect(screen.queryByText(/Sources · retrieved from canon/i)).toBeNull();
  });

  it("shows a safe error message", () => {
    mockState({ error: "Add an AI provider key in Settings.", timestamp: 1 });
    render(<AskPanel campaignId="c1" />);
    expect(screen.getByRole("alert").textContent).toContain("Add an AI provider key");
  });
});
