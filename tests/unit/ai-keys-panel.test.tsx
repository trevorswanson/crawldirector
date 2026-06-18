// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
  embeddingDimensions: null,
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
  embeddingDimensions: 768,
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
  it("offers a tab per provider and shows only the selected provider's form", () => {
    render(<AiKeysPanel campaignId="camp1" configured={[anthropicKey]} />);

    // All three registry providers are pickable (incl. OpenAI-compatible).
    expect(screen.getByRole("tab", { name: /Anthropic/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^OpenAI$/ })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: /OpenAI-compatible/ }),
    ).toBeTruthy();

    // The configured provider is selected by default and marked configured.
    const anthropicTab = screen.getByRole("tab", { name: /Anthropic/ });
    expect(anthropicTab.getAttribute("aria-selected")).toBe("true");
    expect(anthropicTab.querySelector('[aria-label="configured"]')).toBeTruthy();

    // Its form is the only one rendered: last-four hint (never the key), Remove,
    // Replace, Test, and exactly one password key field.
    expect(screen.getByText(/ends ••9999/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /remove/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /replace/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /test/i })).toBeTruthy();
    expect(screen.queryByText(/No key configured/)).toBeNull();

    const inputs = screen.getAllByLabelText(/API key/);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].getAttribute("type")).toBe("password");
  });

  it("swaps the visible form when another provider tab is picked", () => {
    render(<AiKeysPanel campaignId="camp1" configured={[anthropicKey]} />);

    // Anthropic (configured) is shown first; OpenAI's form is not.
    expect(screen.getByText(/ends ••9999/)).toBeTruthy();
    expect(screen.queryByText(/No key configured/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /^OpenAI$/ }));

    // OpenAI has no key here, so its form prompts for one — and Anthropic's
    // configured summary is gone (one form at a time).
    expect(screen.getByText(/No key configured/)).toBeTruthy();
    expect(screen.queryByText(/ends ••9999/)).toBeNull();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
    expect(screen.getAllByLabelText(/API key/)).toHaveLength(1);
  });

  it("shows endpoint + model inputs for the OpenAI-compatible provider and renders its config", () => {
    render(<AiKeysPanel campaignId="camp1" configured={[compatibleKey]} />);

    // The configured compatible provider is selected by default, so its
    // endpoint/model fields render prefilled.
    const endpoint = screen.getByLabelText(/endpoint URL/i) as HTMLInputElement;
    expect(endpoint.value).toBe("http://localhost:11434/v1");
    const model = screen.getByLabelText(/OpenAI-compatible.*chat model/i) as HTMLInputElement;
    expect(model.value).toBe("llama3.1");

    // The BYO embedding model (M5) is prefilled too, for semantic search.
    const embed = screen.getByLabelText(/OpenAI-compatible.*embedding model/i) as HTMLInputElement;
    expect(embed.value).toBe("codestral-embed");
    const dimensions = screen.getByLabelText(/OpenAI-compatible.*embedding dimensions/i) as HTMLInputElement;
    expect(dimensions.value).toBe("768");

    // Only the selected provider's form renders, so there's a single endpoint field.
    expect(screen.getAllByLabelText(/endpoint URL/i)).toHaveLength(1);

    // The configured (keyless) compatible row reads "Configured" + shows the model/endpoint.
    expect(
      screen.getByText(/Configured · llama3.1 · embed: codestral-embed \(768d\) · http:\/\/localhost:11434\/v1/),
    ).toBeTruthy();
  });

  it("exposes per-token price inputs for the selected provider, prefilled when configured", () => {
    render(<AiKeysPanel campaignId="camp1" configured={[compatibleKey]} />);

    // The selected provider's form offers one input + one output price field.
    expect(screen.getAllByLabelText(/input price per million tokens/i)).toHaveLength(1);
    expect(screen.getAllByLabelText(/output price per million tokens/i)).toHaveLength(1);

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
