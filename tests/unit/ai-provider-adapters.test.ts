import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock both vendor SDKs so the adapters can be exercised without network. Each
// mock's default export is the client class; instances expose the one method the
// adapter calls.
const { anthropicCreate, openaiCreate, AnthropicCtor, OpenAICtor } = vi.hoisted(() => {
  const anthropicCreate = vi.fn();
  const openaiCreate = vi.fn();
  return {
    anthropicCreate,
    openaiCreate,
    AnthropicCtor: vi.fn(function () {
      return { messages: { create: anthropicCreate } };
    }),
    OpenAICtor: vi.fn(function () {
      return { chat: { completions: { create: openaiCreate } } };
    }),
  };
});

vi.mock("@anthropic-ai/sdk", () => ({ default: AnthropicCtor }));
vi.mock("openai", () => ({ default: OpenAICtor }));

import { createAnthropicProvider } from "@/server/ai/anthropic";
import { createOpenAiProvider } from "@/server/ai/openai";
import { ProviderError } from "@/server/ai/types";

const pingSchema = z.object({ ok: z.boolean() });

function anthropicToolResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", name: "connection_check", input }],
    usage: {
      input_tokens: 10,
      output_tokens: 3,
      cache_read_input_tokens: 7,
      cache_creation_input_tokens: 2,
    },
  };
}

function openaiJsonResponse(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 11, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 5 } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Anthropic adapter", () => {
  it("forces tool use, strips $schema, validates, and maps usage", async () => {
    anthropicCreate.mockResolvedValue(anthropicToolResponse({ ok: true }));
    const provider = createAnthropicProvider({
      providerId: "anthropic",
      apiKey: "sk-ant-test",
      baseUrl: null,
      model: "claude-opus-4-8",
    });

    const result = await provider.generateStructured({
      schemaName: "connection_check",
      schema: pingSchema,
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result.data).toEqual({ ok: true });
    expect(result.model).toBe("claude-opus-4-8");
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 3,
      cacheReadTokens: 7,
      cacheCreationTokens: 2,
    });

    const arg = anthropicCreate.mock.calls[0][0];
    expect(arg.tool_choice).toEqual({ type: "tool", name: "connection_check" });
    expect(arg.tools[0].input_schema).not.toHaveProperty("$schema");
    expect(arg.tools[0].input_schema.type).toBe("object");
  });

  it("prompt-caches system blocks marked cacheable", async () => {
    anthropicCreate.mockResolvedValue(anthropicToolResponse({ ok: true }));
    const provider = createAnthropicProvider({
      providerId: "anthropic",
      apiKey: "sk-ant-test",
      baseUrl: null,
      model: "claude-opus-4-8",
    });

    await provider.generateStructured({
      schemaName: "connection_check",
      schema: pingSchema,
      system: [
        { text: "stable canon", cache: true },
        { text: "volatile", cache: false },
      ],
      messages: [{ role: "user", content: "ping" }],
    });

    const arg = anthropicCreate.mock.calls[0][0];
    expect(arg.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(arg.system[1]).not.toHaveProperty("cache_control");
  });

  it("retries once with a repair hint, then succeeds", async () => {
    anthropicCreate
      .mockResolvedValueOnce(anthropicToolResponse({ ok: "nope" }))
      .mockResolvedValueOnce(anthropicToolResponse({ ok: true }));
    const provider = createAnthropicProvider({
      providerId: "anthropic",
      apiKey: "sk-ant-test",
      baseUrl: null,
      model: "claude-opus-4-8",
    });

    const result = await provider.generateStructured({
      schemaName: "connection_check",
      schema: pingSchema,
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result.data).toEqual({ ok: true });
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
    const repairMessages = anthropicCreate.mock.calls[1][0].messages;
    expect(repairMessages[repairMessages.length - 1].content).toMatch(/did not match/i);
  });

  it("throws ProviderError when both attempts fail validation", async () => {
    anthropicCreate.mockResolvedValue(anthropicToolResponse({ ok: "still bad" }));
    const provider = createAnthropicProvider({
      providerId: "anthropic",
      apiKey: "sk-ant-test",
      baseUrl: null,
      model: "claude-opus-4-8",
    });

    await expect(
      provider.generateStructured({
        schemaName: "connection_check",
        schema: pingSchema,
        messages: [{ role: "user", content: "ping" }],
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("throws ProviderError when no tool_use block is returned", async () => {
    anthropicCreate.mockResolvedValue({ content: [{ type: "text", text: "hi" }], usage: undefined });
    const provider = createAnthropicProvider({
      providerId: "anthropic",
      apiKey: "sk-ant-test",
      baseUrl: null,
      model: "claude-opus-4-8",
    });

    await expect(
      provider.generateStructured({
        schemaName: "connection_check",
        schema: pingSchema,
        messages: [{ role: "user", content: "ping" }],
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("generate() returns concatenated text and handles missing usage", async () => {
    anthropicCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Hello " },
        { type: "tool_use", input: {} },
        { type: "text", text: "world" },
      ],
      usage: undefined,
    });
    const provider = createAnthropicProvider({
      providerId: "anthropic",
      apiKey: "sk-ant-test",
      baseUrl: null,
      model: "claude-opus-4-8",
    });

    const result = await provider.generate({ messages: [{ role: "user", content: "hi" }] });
    expect(result.text).toBe("Hello world");
    expect(result.usage.inputTokens).toBe(0);
  });
});

describe("OpenAI / OpenAI-compatible adapter", () => {
  it("requests json_schema strict output and maps usage", async () => {
    openaiCreate.mockResolvedValue(openaiJsonResponse(JSON.stringify({ ok: true })));
    const provider = createOpenAiProvider({
      providerId: "openai",
      apiKey: "sk-openai",
      baseUrl: null,
      model: "gpt-4o-mini",
    });

    const result = await provider.generateStructured({
      schemaName: "connection_check",
      schema: pingSchema,
      system: "be terse",
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result.data).toEqual({ ok: true });
    // prompt_tokens (11) includes the cached subset (5); inputTokens is the
    // *uncached* remainder (6) so cached tokens aren't billed twice.
    expect(result.usage).toEqual({
      inputTokens: 6,
      outputTokens: 4,
      cacheReadTokens: 5,
      cacheCreationTokens: 0,
    });

    const arg = openaiCreate.mock.calls[0][0];
    expect(arg.response_format.type).toBe("json_schema");
    expect(arg.response_format.json_schema.strict).toBe(true);
    expect(arg.response_format.json_schema.schema).not.toHaveProperty("$schema");
    expect(arg.messages[0]).toEqual({ role: "system", content: "be terse" });
  });

  it("passes a custom baseURL through for an OpenAI-compatible endpoint", async () => {
    openaiCreate.mockResolvedValue(openaiJsonResponse(JSON.stringify({ ok: true })));
    const provider = createOpenAiProvider({
      providerId: "openai-compatible",
      apiKey: "not-needed",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
    });

    await provider.generateStructured({
      schemaName: "connection_check",
      schema: pingSchema,
      messages: [{ role: "user", content: "ping" }],
    });

    expect(OpenAICtor).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "http://localhost:11434/v1", apiKey: "not-needed" }),
    );
    expect(openaiCreate.mock.calls[0][0].model).toBe("llama3.1");
  });

  it("retries once on unparseable JSON, then succeeds", async () => {
    openaiCreate
      .mockResolvedValueOnce(openaiJsonResponse("not json at all"))
      .mockResolvedValueOnce(openaiJsonResponse(JSON.stringify({ ok: false })));
    const provider = createOpenAiProvider({
      providerId: "openai",
      apiKey: "sk-openai",
      baseUrl: null,
      model: "gpt-4o-mini",
    });

    const result = await provider.generateStructured({
      schemaName: "connection_check",
      schema: pingSchema,
      messages: [{ role: "user", content: "ping" }],
    });
    expect(result.data).toEqual({ ok: false });
    expect(openaiCreate).toHaveBeenCalledTimes(2);
  });

  it("throws ProviderError on an empty structured response", async () => {
    openaiCreate.mockResolvedValue(openaiJsonResponse(""));
    const provider = createOpenAiProvider({
      providerId: "openai",
      apiKey: "sk-openai",
      baseUrl: null,
      model: "gpt-4o-mini",
    });

    await expect(
      provider.generateStructured({
        schemaName: "connection_check",
        schema: pingSchema,
        messages: [{ role: "user", content: "ping" }],
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("generate() returns the message content and handles missing usage", async () => {
    openaiCreate.mockResolvedValue({ choices: [{ message: { content: "plain text" } }], usage: undefined });
    const provider = createOpenAiProvider({
      providerId: "openai",
      apiKey: "sk-openai",
      baseUrl: null,
      model: "gpt-4o-mini",
    });

    const result = await provider.generate({ messages: [{ role: "user", content: "hi" }] });
    expect(result.text).toBe("plain text");
    expect(result.usage.outputTokens).toBe(0);
  });
});
