// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { setAiKeyAction, deleteAiKeyAction, mockUseActionState } = vi.hoisted(() => ({
  setAiKeyAction: vi.fn(),
  deleteAiKeyAction: vi.fn(),
  mockUseActionState: vi.fn(),
}));

vi.mock("@/app/(dm)/campaigns/[id]/settings/actions", () => ({
  setAiKeyAction,
  deleteAiKeyAction,
}));
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

import { AiKeysPanel } from "@/components/settings/ai-keys-panel";
import type { AiKeyView } from "@/server/services/ai-keys";

const anthropicKey: AiKeyView = {
  providerId: "anthropic",
  label: "Anthropic (Claude)",
  lastFour: "9999",
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-02T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionState.mockReturnValue([undefined, vi.fn(), false]);
});

afterEach(() => cleanup());

describe("AiKeysPanel", () => {
  it("renders every provider, masking a configured key and prompting for the rest", () => {
    render(<AiKeysPanel campaignId="camp1" configured={[anthropicKey]} />);

    // Both registry providers are listed.
    expect(screen.getByText("Anthropic (Claude)")).toBeTruthy();
    expect(screen.getByText("OpenAI")).toBeTruthy();

    // Configured provider shows the last-four hint (never the key) + a Remove control.
    expect(screen.getByText(/ends ••9999/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /remove/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /replace/i })).toBeTruthy();

    // Unconfigured provider prompts for a key.
    expect(screen.getByText(/No key configured/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /save key/i })).toBeTruthy();

    // Key inputs are password fields so the secret is never shown.
    const inputs = screen.getAllByLabelText(/API key/);
    expect(inputs).toHaveLength(2);
    inputs.forEach((el) => expect(el.getAttribute("type")).toBe("password"));
  });

  it("surfaces an action error", () => {
    mockUseActionState.mockReturnValue([{ error: "That doesn't look like a valid API key." }, vi.fn(), false]);
    render(<AiKeysPanel campaignId="camp1" configured={[]} />);
    expect(screen.getAllByRole("alert")[0].textContent).toMatch(/valid API key/);
  });

  it("surfaces an action success message", () => {
    mockUseActionState.mockReturnValue([{ success: "Saved Anthropic (Claude) key ending ••9999." }, vi.fn(), false]);
    render(<AiKeysPanel campaignId="camp1" configured={[]} />);
    expect(screen.getAllByText(/Saved Anthropic/)[0]).toBeTruthy();
  });
});
