import { NextResponse } from "next/server";

import { requireUser } from "@/server/auth/session";
import { listCampaignsForUser } from "@/server/services/campaigns";

export async function GET() {
  const user = await requireUser();
  const campaigns = await listCampaignsForUser(user.id);

  return NextResponse.json({
    campaigns: campaigns.map(({ id, name }) => ({ id, name })),
  });
}
