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

import { SessionRecapPanel } from "@/components/sessions/session-recap-panel";
import type { SessionRecapActionState } from "@/app/(dm)/actions";

function mockState(state: SessionRecapActionState) {
  mockUseActionState.mockImplementation(() => [state, vi.fn(), false]);
}

const noopAction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockState(undefined);
});

afterEach(() => cleanup());

describe("SessionRecapPanel", () => {
  it("renders the generate button and an empty-state note with no recap yet", () => {
    render(<SessionRecapPanel action={noopAction} />);
    expect(screen.getByRole("button", { name: /generate recap/i })).toBeTruthy();
    expect(screen.getByText(/never saved/i)).toBeTruthy();
  });

  it("renders the generated recap and model", () => {
    mockState({
      recap: "Donut insulted the Maestro live on air, sending sponsor drama through the roof.",
      model: "claude-opus-4-8",
      timestamp: 1,
    });
    render(<SessionRecapPanel action={noopAction} />);
    expect(screen.getByText(/sponsor drama through the roof/)).toBeTruthy();
    expect(screen.getByText("claude-opus-4-8")).toBeTruthy();
    expect(screen.queryByText(/never saved/i)).toBeNull();
  });

  it("shows a safe error message and keeps the empty-state note hidden", () => {
    mockState({ error: "Add an AI provider key in Settings.", timestamp: 1 });
    render(<SessionRecapPanel action={noopAction} />);
    expect(screen.getByRole("alert").textContent).toContain("Add an AI provider key");
    expect(screen.queryByText(/never saved/i)).toBeNull();
  });
});
