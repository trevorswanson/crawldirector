import { prisma } from "@/server/db";
import { Role } from "@/generated/prisma/client";
import { createCampaignSchema, type CreateCampaignInput } from "@/lib/validation";

// Creating a campaign also makes the creator its OWNER member. Tenancy is
// enforced here: every read is scoped to campaigns the user is a member of.
export async function createCampaign(userId: string, input: CreateCampaignInput) {
  const { name, summary } = createCampaignSchema.parse(input);

  return prisma.campaign.create({
    data: {
      name,
      summary: summary ? summary : null,
      ownerId: userId,
      members: {
        create: { userId, role: Role.OWNER },
      },
    },
    select: { id: true, name: true },
  });
}

export async function listCampaignsForUser(userId: string) {
  return prisma.campaign.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      summary: true,
      createdAt: true,
      members: {
        where: { userId },
        select: { role: true },
      },
    },
  });
}

// Returns the campaign only if the user is a member; otherwise null. The
// caller treats null as not-found / not-authorized (never leak existence).
export async function getCampaignForUser(userId: string, campaignId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      summary: true,
      createdAt: true,
      members: {
        where: { userId },
        select: { role: true },
      },
      _count: { select: { members: true } },
    },
  });
}
