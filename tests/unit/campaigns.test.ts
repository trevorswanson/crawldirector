import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import {
  createCampaign,
  getCampaignForUser,
  listCampaignsForUser,
} from "@/server/services/campaigns";

// These tests exercise the service layer against a real Postgres database
// (DATABASE_URL). They wipe the relevant tables between runs, so point
// DATABASE_URL at a disposable/test database.
function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

beforeEach(async () => {
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("campaign service", () => {
  it("makes the creator an OWNER member", async () => {
    const user = await makeUser("owner@test.com");
    const campaign = await createCampaign(user.id, { name: "World Dungeon" });

    const membership = await prisma.membership.findFirst({
      where: { campaignId: campaign.id, userId: user.id },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("scopes listings to the user's own campaigns (tenancy)", async () => {
    const a = await makeUser("a@test.com");
    const b = await makeUser("b@test.com");
    await createCampaign(a.id, { name: "A's world" });

    expect(await listCampaignsForUser(b.id)).toHaveLength(0);
    expect(await listCampaignsForUser(a.id)).toHaveLength(1);
  });

  it("returns null when a non-member fetches a campaign", async () => {
    const a = await makeUser("a@test.com");
    const b = await makeUser("b@test.com");
    const campaign = await createCampaign(a.id, { name: "Secret" });

    expect(await getCampaignForUser(b.id, campaign.id)).toBeNull();
    expect(await getCampaignForUser(a.id, campaign.id)).not.toBeNull();
  });

  it("rejects invalid input at the boundary", async () => {
    const user = await makeUser("c@test.com");
    await expect(createCampaign(user.id, { name: "" })).rejects.toThrow();
  });
});
