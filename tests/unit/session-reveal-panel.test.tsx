// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const {
  revealEntityBroadlyAction,
  revealSessionKnowledgeAction,
  revokeSessionRevealAction,
  mockUseActionState,
} = vi.hoisted(() => ({
  revealEntityBroadlyAction: vi.fn(),
  revealSessionKnowledgeAction: vi.fn(),
  revokeSessionRevealAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  revealEntityBroadlyAction,
  revealSessionKnowledgeAction,
  revokeSessionRevealAction,
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

import {
  SessionRevealPanel,
  type PlayerRecipientCandidate,
} from "@/components/sessions/session-reveal-panel";
import type { EntityCandidate } from "@/components/entities/entity-typeahead";
import type { SessionRevealView } from "@/server/services/knowledge";

const candidates: EntityCandidate[] = [
  { id: "e1", name: "The Hidden Vault", type: "LOCATION" },
  { id: "e2", name: "Mordecai", type: "NPC" },
];

const players: PlayerRecipientCandidate[] = [
  { membershipId: "m1", userName: "Alice", userEmail: "alice@test" },
];

function reveal(over: Partial<SessionRevealView> = {}): SessionRevealView {
  return {
    id: "k1",
    target: { id: "e1", name: "The Hidden Vault", type: "LOCATION" },
    recipient: { kind: "ENTITY", entity: { id: "e2", name: "Mordecai", type: "NPC" } },
    notes: null,
    revealedAt: new Date(),
    ...over,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof SessionRevealPanel>> = {}) {
  return render(
    <SessionRevealPanel
      campaignId="c1"
      sessionId="s1"
      candidates={candidates}
      players={players}
      reveals={[]}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn()]);
});

afterEach(cleanup);

describe("SessionRevealPanel", () => {
  it("renders both reveal forms and the session history", () => {
    renderPanel({ reveals: [reveal({ notes: "Overheard it." })] });
    expect(screen.getByPlaceholderText("Reveal an entity to all players…")).toBeDefined();
    expect(screen.getByPlaceholderText("What's revealed…")).toBeDefined();
    expect(screen.getByText("Revealed this session · 1")).toBeDefined();
    expect(screen.getAllByText("The Hidden Vault").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mordecai").length).toBeGreaterThan(0);
    expect(screen.getByText("Overheard it.")).toBeDefined();
  });

  it("shows the empty-history note when nothing has been revealed this session", () => {
    renderPanel();
    expect(
      screen.getByText("No private reveals recorded for this session yet."),
    ).toBeDefined();
  });

  it("renders a MEMBERSHIP-recipient history row with the player's name", () => {
    renderPanel({
      reveals: [
        reveal({
          recipient: { kind: "MEMBERSHIP", membershipId: "m1", userName: "Alice", userEmail: "alice@test" },
        }),
      ],
    });
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
  });

  it("surfaces a broad-reveal error from action state", () => {
    // BroadRevealForm calls useActionState first (render order).
    mockUseActionState.mockReturnValueOnce([{ error: "Already locked." }, vi.fn()]);
    renderPanel();
    expect(screen.getByText("Already locked.")).toBeDefined();
  });

  it("disables the broad-reveal submit button until an entity is picked", () => {
    renderPanel();
    const button = screen.getByRole("button", {
      name: "Reveal to players",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Reveal an entity to all players…"), {
      target: { value: "Mordecai" },
    });
    // The broad-reveal dropdown's own match is first in the DOM (its form
    // renders before the private-reveal form's own, always-open, typeahead).
    fireEvent.click(screen.getAllByText("Mordecai")[0]);
    expect(button.disabled).toBe(false);
  });

  it("defaults the private-reveal recipient kind to Player when players exist, and shows a player select", () => {
    renderPanel();
    expect(screen.getByLabelText("Reveal to player")).toBeDefined();
    expect(screen.queryByPlaceholderText("Who learns this…")).toBeNull();
  });

  it("defaults to Entity recipient kind when no players have joined", () => {
    renderPanel({ players: [] });
    expect(screen.getByPlaceholderText("Who learns this…")).toBeDefined();

    // Toggling to Player with no players joined shows the empty note instead
    // of an unusable (optionless) select.
    fireEvent.click(screen.getByRole("button", { name: "Player" }));
    expect(screen.getByText("No players have joined this campaign yet.")).toBeDefined();
  });

  it("switches to an entity-recipient typeahead when Entity is toggled", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Entity" }));
    expect(screen.getByPlaceholderText("Who learns this…")).toBeDefined();
    expect(screen.queryByLabelText("Reveal to player")).toBeNull();
  });

  it("revokes a reveal via revokeSessionRevealAction with the bound campaign/session/grant ids", async () => {
    revokeSessionRevealAction.mockResolvedValue(undefined);
    renderPanel({ reveals: [reveal()] });

    fireEvent.submit(screen.getByRole("button", { name: "Revoke reveal" }).closest("form")!);

    await vi.waitFor(() => expect(revokeSessionRevealAction).toHaveBeenCalled());
    expect(revokeSessionRevealAction.mock.calls[0].slice(0, 3)).toEqual(["c1", "s1", "k1"]);
  });
});
