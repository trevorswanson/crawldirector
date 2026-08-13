// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { mockUseActionState } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
}));

vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { SessionRecapPanel } from "@/components/sessions/session-recap-panel";

// A single mocked useActionState implementation backs both the panel's own
// "generate" hook call and the nested PublishRecapForm's "publish" hook call
// (both resolve to whatever object mockState() was given) — simpler than
// juggling per-call mockReturnValueOnce ordering, and sufficient since the two
// consumers read disjoint fields off the same object (recap/model vs.
// entityId/error).
function mockState(state: unknown) {
  mockUseActionState.mockImplementation(() => [state, vi.fn(), false]);
}

const noopAction = vi.fn();

function renderPanel(overState: unknown = undefined) {
  mockState(overState);
  return render(
    <SessionRecapPanel
      action={noopAction}
      publishAction={noopAction}
      campaignId="c1"
      defaultPublishTitle="Previously on Dungeon Crawler World: Floor 9 Breach"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState(undefined);
});

afterEach(() => cleanup());

describe("SessionRecapPanel", () => {
  it("renders the generate button and an empty-state note with no recap yet", () => {
    renderPanel(undefined);
    expect(screen.getByRole("button", { name: /generate recap/i })).toBeTruthy();
    expect(screen.getByText(/never saved/i)).toBeTruthy();
  });

  it("renders the generated recap, model, and a collapsed publish affordance", () => {
    renderPanel({
      recap: "Donut insulted the Maestro live on air, sending sponsor drama through the roof.",
      model: "claude-opus-4-8",
      timestamp: 1,
    });
    expect(screen.getByText(/sponsor drama through the roof/)).toBeTruthy();
    expect(screen.getByText("claude-opus-4-8")).toBeTruthy();
    expect(screen.queryByText(/never saved/i)).toBeNull();
    expect(screen.getByRole("button", { name: /publish to players/i })).toBeTruthy();
  });

  it("shows a safe error message and keeps the empty-state note hidden", () => {
    renderPanel({ error: "Add an AI provider key in Settings.", timestamp: 1 });
    expect(screen.getByRole("alert").textContent).toContain("Add an AI provider key");
    expect(screen.queryByText(/never saved/i)).toBeNull();
  });

  it("expands the publish form with the recap carried as a hidden field", () => {
    const { container } = renderPanel({
      recap: "Carl found the Grull Legion's hidden cache.",
      timestamp: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: /publish to players/i }));

    const titleInput = screen.getByLabelText(/broadcast title/i) as HTMLInputElement;
    expect(titleInput.value).toBe("Previously on Dungeon Crawler World: Floor 9 Breach");

    const recapInput = container.querySelector('input[name="recap"]') as HTMLInputElement;
    expect(recapInput.value).toBe("Carl found the Grull Legion's hidden cache.");
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeTruthy();
  });

  it("shows a confirmation link once the publish action returns an entity id", () => {
    renderPanel({
      recap: "Carl found the Grull Legion's hidden cache.",
      timestamp: 3,
      entityId: "msg-9",
    });
    expect(screen.getByText(/published to players/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /view message/i });
    expect(link.getAttribute("href")).toBe("/campaigns/c1/entities/msg-9");
    expect(screen.queryByRole("button", { name: /publish to players/i })).toBeNull();
  });
});
