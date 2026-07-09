import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import {
  CanonStatus,
  EntityType,
  Role,
  Visibility,
} from "@/generated/prisma/client";
import { createCampaign } from "@/server/services/campaigns";
import { getSystemMessageFeed } from "@/server/services/system-feed";

// Service-layer tests against a real Postgres (see campaigns.test.ts). The
// System-message feed is a visibility-projected read (invariant #5): a PLAYER
// sees only PLAYER_VISIBLE, live-CANON SYSTEM_MESSAGE entities, newest first.
function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function addPlayer(userId: string, campaignId: string) {
  return prisma.membership.create({
    data: { userId, campaignId, role: Role.PLAYER },
  });
}

async function makeMessage(
  campaignId: string,
  name: string,
  overrides: {
    type?: EntityType;
    status?: CanonStatus;
    visibility?: Visibility;
    summary?: string | null;
    description?: string | null;
    tags?: string[];
    createdAt?: Date;
  } = {},
) {
  return prisma.entity.create({
    data: {
      campaignId,
      type: overrides.type ?? EntityType.SYSTEM_MESSAGE,
      name,
      summary: overrides.summary ?? null,
      description: overrides.description ?? null,
      tags: overrides.tags ?? [],
      status: overrides.status ?? CanonStatus.CANON,
      visibility: overrides.visibility ?? Visibility.PLAYER_VISIBLE,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
}

beforeEach(async () => {
  await prisma.membership.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getSystemMessageFeed", () => {
  it("returns player-visible CANON System messages newest first", async () => {
    const owner = await makeUser("owner@example.com");
    const player = await makeUser("player@example.com");
    const campaign = await createCampaign(owner.id, { name: "Feed" });
    await addPlayer(player.id, campaign.id);

    await makeMessage(campaign.id, "First broadcast", {
      summary: "It begins.",
      description: "**Welcome**, crawlers.",
      tags: ["floor-1"],
      createdAt: new Date("2026-07-01T00:00:00Z"),
    });
    await makeMessage(campaign.id, "Second broadcast", {
      createdAt: new Date("2026-07-05T00:00:00Z"),
    });

    const feed = await getSystemMessageFeed(player.id, campaign.id);

    expect(feed.map((m) => m.name)).toEqual([
      "Second broadcast",
      "First broadcast",
    ]);
    const first = feed[1];
    expect(first.summary).toBe("It begins.");
    expect(first.description).toBe("**Welcome**, crawlers.");
    expect(first.tags).toEqual(["floor-1"]);
    expect(first.broadcastAt).toBeInstanceOf(Date);
  });

  it("hides DM-only, non-CANON, and non-SYSTEM_MESSAGE entities from a player", async () => {
    const owner = await makeUser("owner@example.com");
    const player = await makeUser("player@example.com");
    const campaign = await createCampaign(owner.id, { name: "Feed" });
    await addPlayer(player.id, campaign.id);

    await makeMessage(campaign.id, "Visible", {});
    await makeMessage(campaign.id, "DM only", {
      visibility: Visibility.DM_ONLY,
    });
    await makeMessage(campaign.id, "Pending", { status: CanonStatus.PENDING });
    await makeMessage(campaign.id, "Archived", {
      status: CanonStatus.ARCHIVED,
    });
    await makeMessage(campaign.id, "Not a message", { type: EntityType.NPC });

    const feed = await getSystemMessageFeed(player.id, campaign.id);

    expect(feed.map((m) => m.name)).toEqual(["Visible"]);
  });

  it("returns an empty list for a non-member", async () => {
    const owner = await makeUser("owner@example.com");
    const outsider = await makeUser("outsider@example.com");
    const campaign = await createCampaign(owner.id, { name: "Feed" });
    await makeMessage(campaign.id, "Visible", {});

    expect(await getSystemMessageFeed(outsider.id, campaign.id)).toEqual([]);
  });

  it("shows a DM/owner every CANON System message regardless of visibility", async () => {
    const owner = await makeUser("owner@example.com");
    const campaign = await createCampaign(owner.id, { name: "Feed" });
    await makeMessage(campaign.id, "Visible", {});
    await makeMessage(campaign.id, "DM only", {
      visibility: Visibility.DM_ONLY,
    });

    const feed = await getSystemMessageFeed(owner.id, campaign.id);

    expect(feed.map((m) => m.name).sort()).toEqual(["DM only", "Visible"]);
  });
});
