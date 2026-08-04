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

import { CreateSessionForm } from "@/components/sessions/create-session-form";
import type { SessionActionState } from "@/app/(dm)/actions";

function mockState(state: SessionActionState) {
  mockUseActionState.mockImplementation(() => [state, vi.fn(), false]);
}

const noopAction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockState(undefined);
});

afterEach(() => cleanup());

describe("CreateSessionForm", () => {
  it("renders the title, date, focus, and notes fields", () => {
    render(<CreateSessionForm action={noopAction} />);
    expect(screen.getByLabelText("Session title")).toBeTruthy();
    expect(screen.getByLabelText("Date played")).toBeTruthy();
    expect(screen.getByLabelText("Focus")).toBeTruthy();
    expect(screen.getByLabelText("Prep notes")).toBeTruthy();
  });

  it("shows a validation/service error", () => {
    mockState({ error: "Session title is required." });
    render(<CreateSessionForm action={noopAction} />);
    expect(screen.getByRole("alert").textContent).toContain("Session title is required.");
  });
});
