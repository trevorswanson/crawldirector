import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import {
  createCampaign,
  getCampaignForUser,
  listCampaignsForUser,
} from "@/server/services/campaigns";

// These tests exercise the service layer against a real Postgres database
// (DATABASE_URL). They wipe the relevant tables between runs, so point
// DATABASE_URL at a disposable/test database. CI provisions one; locally use
// `podman run ... postgres` + `prisma migrate deploy`.
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

describe("createCampaign", () => {
  it("makes the creator an OWNER member", async () => {
    const user = await makeUser("owner@test.com");
    const campaign = await createCampaign(user.id, { name: "World Dungeon" });

    const membership = await prisma.membership.findFirst({
      where: { campaignId: campaign.id, userId: user.id },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("persists a provided summary", async () => {
    const user = await makeUser("sum@test.com");
    const campaign = await createCampaign(user.id, {
      name: "Has summary",
      summary: "A floor-by-floor run",
    });

    const stored = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: { summary: true },
    });
    expect(stored?.summary).toBe("A floor-by-floor run");
  });

  it("stores null for an empty summary", async () => {
    const user = await makeUser("nosum@test.com");
    const campaign = await createCampaign(user.id, {
      name: "No summary",
      summary: "",
    });

    const stored = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: { summary: true },
    });
    expect(stored?.summary).toBeNull();
  });

  it("rejects invalid input at the boundary", async () => {
    const user = await makeUser("c@test.com");
    await expect(createCampaign(user.id, { name: "" })).rejects.toThrow();
  });
});

describe("listCampaignsForUser", () => {
  it("scopes listings to the user's own campaigns (tenancy)", async () => {
    const a = await makeUser("a@test.com");
    const b = await makeUser("b@test.com");
    await createCampaign(a.id, { name: "A's world" });

    expect(await listCampaignsForUser(b.id)).toHaveLength(0);

    const aList = await listCampaignsForUser(a.id);
    expect(aList).toHaveLength(1);
    expect(aList[0].name).toBe("A's world");
    // The member projection carries the requesting user's role.
    expect(aList[0].members[0]?.role).toBe("OWNER");
  });
});

describe("getCampaignForUser", () => {
  it("returns the campaign (with member count) for a member", async () => {
    const a = await makeUser("a@test.com");
    const campaign = await createCampaign(a.id, { name: "Secret" });

    const result = await getCampaignForUser(a.id, campaign.id);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Secret");
    expect(result?.members[0]?.role).toBe("OWNER");
    expect(result?._count.members).toBe(1);
  });

  it("returns null when a non-member fetches a campaign (never leak existence)", async () => {
    const a = await makeUser("a@test.com");
    const b = await makeUser("b@test.com");
    const campaign = await createCampaign(a.id, { name: "Secret" });

    expect(await getCampaignForUser(b.id, campaign.id)).toBeNull();
  });
});
