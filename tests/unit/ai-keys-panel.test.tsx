// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { setAiKeyAction, deleteAiKeyAction, testAiConnectionAction, mockUseActionState } =
  vi.hoisted(() => ({
    setAiKeyAction: vi.fn(),
    deleteAiKeyAction: vi.fn(),
    testAiConnectionAction: vi.fn(),
    mockUseActionState: vi.fn(),
  }));

vi.mock("@/app/(dm)/campaigns/[id]/settings/actions", () => ({
  setAiKeyAction,
  deleteAiKeyAction,
  testAiConnectionAction,
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
  baseUrl: null,
  model: null,
  embeddingModel: null,
  inputPerMTokUsd: null,
  outputPerMTokUsd: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-02T00:00:00Z"),
};

const compatibleKey: AiKeyView = {
  providerId: "openai-compatible",
  label: "OpenAI-compatible (self-hosted / proxy)",
  lastFour: "",
  baseUrl: "http://localhost:11434/v1",
  model: "llama3.1",
  embeddingModel: "codestral-embed",
  inputPerMTokUsd: 0.5,
  outputPerMTokUsd: 1.5,
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

    // All three registry providers are listed (incl. OpenAI-compatible).
    expect(screen.getByText("Anthropic (Claude)")).toBeTruthy();
    expect(screen.getByText("OpenAI")).toBeTruthy();
    expect(screen.getByText("OpenAI-compatible (self-hosted / proxy)")).toBeTruthy();

    // Configured provider shows the last-four hint (never the key) + Remove + Test.
    expect(screen.getByText(/ends ••9999/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /remove/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /replace/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /test/i })).toBeTruthy();

    // Unconfigured providers prompt for a key (openai + openai-compatible).
    expect(screen.getAllByText(/No key configured/)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^save$/i }).length).toBeGreaterThan(0);

    // Key inputs are password fields so the secret is never shown (one per provider).
    const inputs = screen.getAllByLabelText(/API key/);
    expect(inputs).toHaveLength(3);
    inputs.forEach((el) => expect(el.getAttribute("type")).toBe("password"));
  });

  it("shows endpoint + model inputs for the OpenAI-compatible provider and renders its config", () => {
    render(<AiKeysPanel campaignId="camp1" configured={[compatibleKey]} />);

    // Only the compatible provider exposes endpoint/model fields, prefilled.
    const endpoint = screen.getByLabelText(/endpoint URL/i) as HTMLInputElement;
    expect(endpoint.value).toBe("http://localhost:11434/v1");
    const model = screen.getByLabelText(/OpenAI-compatible.*chat model/i) as HTMLInputElement;
    expect(model.value).toBe("llama3.1");

    // The BYO embedding model (M5) is prefilled too, for semantic search.
    const embed = screen.getByLabelText(/OpenAI-compatible.*embedding model/i) as HTMLInputElement;
    expect(embed.value).toBe("codestral-embed");

    // First-party providers don't show endpoint fields.
    expect(screen.getAllByLabelText(/endpoint URL/i)).toHaveLength(1);

    // The configured (keyless) compatible row reads "Configured" + shows the model/endpoint.
    expect(
      screen.getByText(/Configured · llama3.1 · embed: codestral-embed · http:\/\/localhost:11434\/v1/),
    ).toBeTruthy();
  });

  it("exposes per-token price inputs for every provider, prefilled when configured", () => {
    render(<AiKeysPanel campaignId="camp1" configured={[compatibleKey]} />);

    // Every provider row offers input + output price fields (3 of each).
    expect(screen.getAllByLabelText(/input price per million tokens/i)).toHaveLength(3);
    expect(screen.getAllByLabelText(/output price per million tokens/i)).toHaveLength(3);

    // The configured compatible key prefills its rates and shows them in the summary.
    const input = screen.getByLabelText(/OpenAI-compatible.*input price/i) as HTMLInputElement;
    const output = screen.getByLabelText(/OpenAI-compatible.*output price/i) as HTMLInputElement;
    expect(input.value).toBe("0.5");
    expect(output.value).toBe("1.5");
    expect(screen.getByText(/\$0\.5\/\$1\.5 per 1M tok/)).toBeTruthy();
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
