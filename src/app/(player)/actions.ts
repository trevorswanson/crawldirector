"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth/session";
import { ServiceError } from "@/lib/errors";
import { playerSuggestionSchema } from "@/lib/validation";
import { logActionError } from "@/server/log";
import { askCampaign, type AskActionState } from "@/server/services/ask";
import { createPlayerSuggestion } from "@/server/services/review";

// Player-side server actions for the `(player)` route group. Kept separate
// from `(dm)/actions.ts` so the two consoles' action surfaces stay independent
// even where they call the same read-only service.

// "Ask the System" (M7 slice 5 — docs/PROGRESS.md). Same read-only,
// retrieval-augmented `askCampaign` service the DM's "Ask the Campaign" uses —
// it is already role-scoped (invariant #5: `searchCanon` retrieval is scoped
// to the caller's membership role, so a player's question can never surface
// DM-only or secret canon). Never writes canon (invariant #1), so no
// revalidate. Errors are safe messages (no key/raw provider text — invariant #6).
export async function askCampaignAction(
  campaignId: string,
  _prev: AskActionState,
  formData: FormData,
): Promise<AskActionState> {
  void _prev;
  const user = await requireUser();
  const question = String(formData.get("question") ?? "");
  try {
    const result = await askCampaign(user.id, campaignId, question);
    return {
      answer: result.answer,
      grounded: result.grounded,
      sources: result.sources,
      model: result.model,
      timestamp: Date.now(),
    };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, timestamp: Date.now() };
    logActionError("Player ask campaign action failed", error);
    return { error: "The System couldn't answer that. Please try again.", timestamp: Date.now() };
  }
}

export type SuggestionActionState =
  | { error?: string; success?: string; timestamp?: number }
  | undefined;

// Submit a suggestion (M7 slice 6 — docs/PROGRESS.md). Unlike the read-only
// ask action, this writes a PENDING `PLAYER_SUGGESTION` change set (never
// canon directly — invariant #1), so a successful submit revalidates the
// suggestions page to refresh the caller's own history list.
export async function submitSuggestionAction(
  campaignId: string,
  _prev: SuggestionActionState,
  formData: FormData,
): Promise<SuggestionActionState> {
  void _prev;
  const user = await requireUser();

  const parsed = playerSuggestionSchema.safeParse({
    summary: formData.get("summary") ?? undefined,
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", timestamp: Date.now() };
  }

  try {
    await createPlayerSuggestion(user.id, campaignId, parsed.data);
    revalidatePath(`/play/campaigns/${campaignId}/suggestions`);
    return { success: "Suggestion submitted — your DM will review it.", timestamp: Date.now() };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, timestamp: Date.now() };
    logActionError("Player submit suggestion action failed", error);
    return { error: "Could not submit your suggestion. Please try again.", timestamp: Date.now() };
  }
}
