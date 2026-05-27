"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/server/auth";
import { requireUser } from "@/server/auth/session";
import { createCampaign } from "@/server/services/campaigns";
import { createCampaignSchema } from "@/lib/validation";

export type CampaignActionState = { error?: string } | undefined;

export async function createCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const user = await requireUser();

  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
    summary: formData.get("summary"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let campaignId: string;
  try {
    const campaign = await createCampaign(user.id, parsed.data);
    campaignId = campaign.id;
  } catch {
    return { error: "Could not create the campaign. Please try again." };
  }

  redirect(`/campaigns/${campaignId}`);
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}
