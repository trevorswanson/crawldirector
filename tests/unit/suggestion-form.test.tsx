// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { mockUseActionState } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
}));

vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import { SuggestionForm } from "@/components/crawler/suggestion-form";
import type { SuggestionActionState } from "@/app/(player)/actions";

function mockState(state: SuggestionActionState) {
  mockUseActionState.mockImplementation(() => [state, vi.fn(), false]);
}

const noopAction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockState(undefined);
});

afterEach(() => cleanup());

describe("SuggestionForm", () => {
  it("prefills the bio and notes fields from the crawler's current values", () => {
    render(
      <SuggestionForm
        action={noopAction}
        currentSummary="Old bio"
        currentDescription="Old notes"
      />,
    );
    expect((screen.getByLabelText(/bio/i) as HTMLTextAreaElement).value).toBe("Old bio");
    expect((screen.getByLabelText(/notes/i) as HTMLTextAreaElement).value).toBe("Old notes");
  });

  it("renders blank fields when the crawler has no current bio/notes", () => {
    render(
      <SuggestionForm action={noopAction} currentSummary={null} currentDescription={null} />,
    );
    expect((screen.getByLabelText(/bio/i) as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText(/notes/i) as HTMLTextAreaElement).value).toBe("");
  });

  it("shows a safe error message", () => {
    mockState({ error: "You have no crawler linked yet.", timestamp: 1 });
    render(<SuggestionForm action={noopAction} currentSummary={null} currentDescription={null} />);
    expect(screen.getByRole("alert").textContent).toContain("no crawler linked");
  });

  it("shows a success message after submitting", () => {
    mockState({ success: "Suggestion submitted — your DM will review it.", timestamp: 1 });
    render(<SuggestionForm action={noopAction} currentSummary={null} currentDescription={null} />);
    expect(screen.getByText(/your DM will review it/i)).toBeTruthy();
  });
});
