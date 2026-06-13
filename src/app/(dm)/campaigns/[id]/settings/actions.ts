"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/session";
import { logActionError } from "@/server/log";
import { ServiceError } from "@/lib/errors";
import { setAiKeySchema, setSpendCapSchema } from "@/lib/validation";
import { deleteAiKey, setAiKey } from "@/server/services/ai-keys";
import { setCampaignSpendCap } from "@/server/services/ai-usage";
import { testAiConnection } from "@/server/ai";

export type SettingsActionState =
  | { error?: string; success?: string; timestamp?: number }
  | undefined;

// Save (or replace) the DM's BYO key for a provider. The plaintext key never
// leaves the server: the service encrypts it before persisting, and we return
// only a success/error message — never the key.
export async function setAiKeyAction(
  campaignId: string,
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireUser();

  const parsed = setAiKeySchema.safeParse({
    providerId: formData.get("providerId"),
    // Coerce missing optional fields (FormData.get → null) to undefined so the
    // schema defaults apply.
    apiKey: formData.get("apiKey") ?? undefined,
    baseUrl: formData.get("baseUrl") ?? undefined,
    model: formData.get("model") ?? undefined,
    inputPerMTokUsd: formData.get("inputPerMTokUsd") ?? undefined,
    outputPerMTokUsd: formData.get("outputPerMTokUsd") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", timestamp: Date.now() };
  }

  try {
    const key = await setAiKey(user.id, campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}/settings`);
    const hint = key.lastFour ? ` ending ••${key.lastFour}` : "";
    return { success: `Saved ${key.label}${hint}.`, timestamp: Date.now() };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, timestamp: Date.now() };
    logActionError("Set AI key action failed", error);
    return { error: "Could not save the key. Please try again.", timestamp: Date.now() };
  }
}

// Verify a configured provider key/endpoint/model with a tiny live call. Returns
// a success/error message only — never the key. DM/co-DM only (the service
// enforces the role).
export async function testAiConnectionAction(
  campaignId: string,
  providerId: string,
  _prev: SettingsActionState,
  _formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireUser();
  try {
    const result = await testAiConnection(user.id, campaignId, providerId);
    return {
      success: `Connected to ${result.model} in ${result.latencyMs} ms.`,
      timestamp: Date.now(),
    };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, timestamp: Date.now() };
    logActionError("Test AI connection action failed", error);
    return { error: "Could not reach the provider. Please try again.", timestamp: Date.now() };
  }
}

// Set or clear the campaign's AI spend cap. An empty field clears it (null).
// DM/co-DM only (the service enforces the role). Returns a success/error message.
export async function setSpendCapAction(
  campaignId: string,
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireUser();

  const parsed = setSpendCapSchema.safeParse({
    spendCapUsd: formData.get("spendCapUsd") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", timestamp: Date.now() };
  }

  try {
    const { spendCapUsd } = await setCampaignSpendCap(user.id, campaignId, parsed.data.spendCapUsd);
    revalidatePath(`/campaigns/${campaignId}/settings`);
    return {
      success:
        spendCapUsd == null
          ? "Spend cap cleared."
          : `Spend cap set to $${spendCapUsd.toFixed(2)}.`,
      timestamp: Date.now(),
    };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, timestamp: Date.now() };
    logActionError("Set spend cap action failed", error);
    return { error: "Could not save the spend cap. Please try again.", timestamp: Date.now() };
  }
}

// Remove the DM's key for a provider. Bound to (campaignId, providerId) and used
// directly as a `<form action>`, so it returns void; revalidation refreshes the
// page state. A failure (e.g. the key was already gone) is logged, not surfaced —
// the post-revalidate page already reflects the true state.
export async function deleteAiKeyAction(campaignId: string, providerId: string): Promise<void> {
  const user = await requireUser();
  try {
    await deleteAiKey(user.id, campaignId, providerId);
  } catch (error) {
    if (!(error instanceof ServiceError)) {
      logActionError("Delete AI key action failed", error);
    }
  }
  revalidatePath(`/campaigns/${campaignId}/settings`);
}
