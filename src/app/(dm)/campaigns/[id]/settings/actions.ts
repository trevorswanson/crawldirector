"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/session";
import { ServiceError } from "@/lib/errors";
import { setAiKeySchema } from "@/lib/validation";
import { deleteAiKey, setAiKey } from "@/server/services/ai-keys";

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
    apiKey: formData.get("apiKey"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", timestamp: Date.now() };
  }

  try {
    const key = await setAiKey(user.id, campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}/settings`);
    return { success: `Saved ${key.label} key ending ••${key.lastFour}.`, timestamp: Date.now() };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, timestamp: Date.now() };
    console.error("Set AI key action failed:", error);
    return { error: "Could not save the key. Please try again.", timestamp: Date.now() };
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
      console.error("Delete AI key action failed:", error);
    }
  }
  revalidatePath(`/campaigns/${campaignId}/settings`);
}
