import { z, type ZodType } from "zod";

import { ProviderError, type LLMUsage, type StructuredResult } from "./types";

// Shared structured-output plumbing for the adapters (M4 — docs/04-ai-
// integration.md). Each adapter knows how to *ask* its provider for JSON; the
// validate-and-repair loop is identical, so it lives here.

// JSON Schema for a provider's structured-output mode, derived from a Zod
// schema. We strip `$schema` (providers reject the extra key) and assert the
// `object` shape both Anthropic tool input_schemas and OpenAI json_schema expect.
export type JsonSchema = Record<string, unknown> & { type: "object" };

export function toJsonSchema(schema: ZodType<unknown>): JsonSchema {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js as JsonSchema;
}

// Appended to the prompt on the second attempt when the first result failed Zod
// validation. Kept generic so it suits any schema.
export const REPAIR_HINT =
  "Your previous response did not match the required JSON structure. " +
  "Return only valid JSON that satisfies the schema exactly, with no extra fields.";

export type StructuredAttempt = {
  /** The parsed-but-unvalidated payload the provider returned (or undefined). */
  raw: unknown;
  usage: LLMUsage;
  model: string;
  providerId: string;
};

// Run a single-attempt provider call up to twice: once normally, then with a
// repair hint if the first result fails Zod validation. Throws ProviderError if
// neither attempt validates — generators must never build canon from malformed
// output (docs/04: "no partial canon").
export async function withRepair<T>(
  schema: ZodType<T>,
  attempt: (repairHint: string | null) => Promise<StructuredAttempt>,
): Promise<StructuredResult<T>> {
  for (const hint of [null, REPAIR_HINT]) {
    const res = await attempt(hint);
    const parsed = schema.safeParse(res.raw);
    if (parsed.success) {
      return {
        data: parsed.data,
        usage: res.usage,
        model: res.model,
        providerId: res.providerId,
      };
    }
  }
  throw new ProviderError("The model did not return data matching the expected schema.");
}
