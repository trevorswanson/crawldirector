import { notFound, redirect } from "next/navigation";

import { Role } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { getMembershipRole } from "@/server/services/campaigns";
import { campaignHomeHref } from "@/lib/campaign-routes";

// Role gate for the whole player crawler interface. DMs/co-DMs/owners of this
// campaign belong in the DM console — send them there so the player view is
// only ever rendered for actual players (invariant #5: players read only via
// the visibility projection). Non-members 404 (never leak existence).
export default async function PlayerCampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const role = await getMembershipRole(user.id, id);

  if (!role) notFound();
  if (role !== Role.PLAYER) redirect(campaignHomeHref(role, id));

  return children;
}
