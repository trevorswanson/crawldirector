import { redirect } from "next/navigation";

import { Role } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { getMembershipRole } from "@/server/services/campaigns";
import { campaignHomeHref } from "@/lib/campaign-routes";

// Role gate for the DM console. A PLAYER who lands on (or bookmarks) a DM
// campaign URL is sent to their crawler interface — the DM console is never
// rendered for players. Non-members fall through to each page's own
// member check (getCampaignForUser → notFound), so existence never leaks.
export default async function DmCampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const role = await getMembershipRole(user.id, id);

  if (role === Role.PLAYER) redirect(campaignHomeHref(role, id));

  return children;
}
