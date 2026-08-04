"use server";

import { requireUser } from "@/server/auth/session";
import { ServiceError } from "@/lib/errors";
import { logActionError } from "@/server/log";
import { askCampaign, type AskActionState } from "@/server/services/ask";

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
