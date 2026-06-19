import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CanonStatus, EntityType, Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { archiveEntity, createGenericEntity } from "@/server/services/entities";
import {
  countReferrers,
  getCampaignIntegrityReport,
  validateEntityReferences,
} from "@/server/services/references";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function createEntity(
  userId: string,
  campaignId: string,
  input: {
    type: "ITEM" | "ITEM_TYPE" | "NPC";
    name: string;
    visibility?: "DM_ONLY" | "PLAYER_VISIBLE";
    itemTypeId?: string;
  },
) {
  return createGenericEntity(userId, campaignId, {
    type: input.type,
    name: input.name,
    summary: "",
    description: "",
    visibility: input.visibility ?? "DM_ONLY",
    tags: [],
    ...(input.itemTypeId ? { itemTypeId: input.itemTypeId } : {}),
  });
}

beforeEach(async () => {
  await prisma.crawler.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("reference integrity service (ADR 0011 Part B)", () => {
  describe("validateEntityReferences", () => {
    it("resolves a valid reference to its target name, not broken", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const itemType = await createEntity(dm.id, campaign.id, {
        type: "ITEM_TYPE",
        name: "Magic Sword",
      });
      const item = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Excalibur",
        itemTypeId: itemType.id,
      });

      const checks = await validateEntityReferences(dm.id, campaign.id, item.id);
      expect(checks).toEqual([
        {
          field: "itemTypeId",
          patchKey: "data.itemTypeId",
          targetType: "ITEM_TYPE",
          targetId: itemType.id,
          resolvedName: "Magic Sword",
          broken: false,
        },
      ]);
    });

    it("flags a reference to a missing target as broken", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const item = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Orphan Blade",
        itemTypeId: "nonexistent-id",
      });

      const checks = await validateEntityReferences(dm.id, campaign.id, item.id);
      expect(checks).toHaveLength(1);
      expect(checks[0]).toMatchObject({ broken: true, resolvedName: null });
    });

    it("flags a reference to an archived target as broken", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const itemType = await createEntity(dm.id, campaign.id, {
        type: "ITEM_TYPE",
        name: "Retired Type",
      });
      const item = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Dangling Item",
        itemTypeId: itemType.id,
      });

      await archiveEntity(dm.id, campaign.id, itemType.id);

      const checks = await validateEntityReferences(dm.id, campaign.id, item.id);
      expect(checks[0]).toMatchObject({ broken: true, resolvedName: null });
    });

    it("flags a reference to a wrong-type target as broken", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const npc = await createEntity(dm.id, campaign.id, {
        type: "NPC",
        name: "Not A Type",
      });
      const item = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Mistyped Item",
        itemTypeId: npc.id,
      });

      const checks = await validateEntityReferences(dm.id, campaign.id, item.id);
      expect(checks[0]).toMatchObject({ broken: true, resolvedName: null });
    });

    it("returns [] for a type with no reference fields", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const npc = await createEntity(dm.id, campaign.id, {
        type: "NPC",
        name: "Plain NPC",
      });

      expect(await validateEntityReferences(dm.id, campaign.id, npc.id)).toEqual([]);
    });

    it("returns [] for a non-member", async () => {
      const dm = await makeUser("dm@test.com");
      const outsider = await makeUser("outsider@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const item = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Hidden Item",
        itemTypeId: "x",
      });

      expect(await validateEntityReferences(outsider.id, campaign.id, item.id)).toEqual([]);
    });

    it("returns [] for a missing / out-of-scope entity", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });

      expect(await validateEntityReferences(dm.id, campaign.id, "missing-id")).toEqual([]);
    });

    it("scopes resolution to the requester's visibility (player can't see a DM-only target)", async () => {
      const dm = await makeUser("dm@test.com");
      const player = await makeUser("player@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      await prisma.membership.create({
        data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
      });

      const itemType = await createEntity(dm.id, campaign.id, {
        type: "ITEM_TYPE",
        name: "Secret Type",
        visibility: "DM_ONLY",
      });
      const item = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Public Item",
        visibility: "PLAYER_VISIBLE",
        itemTypeId: itemType.id,
      });

      // DM resolves it fine; the player can't see the DM-only target, so it reads
      // as unresolved — which is why the page gates the broken badge to DMs.
      const dmChecks = await validateEntityReferences(dm.id, campaign.id, item.id);
      expect(dmChecks[0]).toMatchObject({ broken: false, resolvedName: "Secret Type" });

      const playerChecks = await validateEntityReferences(player.id, campaign.id, item.id);
      expect(playerChecks[0]).toMatchObject({ broken: true, resolvedName: null });
    });
  });

  describe("countReferrers", () => {
    it("counts live entities that reference a target", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const itemType = await createEntity(dm.id, campaign.id, {
        type: "ITEM_TYPE",
        name: "Popular Type",
      });
      await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Item A",
        itemTypeId: itemType.id,
      });
      await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Item B",
        itemTypeId: itemType.id,
      });

      expect(await countReferrers(dm.id, campaign.id, itemType.id)).toBe(2);
    });

    it("excludes archived referrers", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const itemType = await createEntity(dm.id, campaign.id, {
        type: "ITEM_TYPE",
        name: "Type",
      });
      await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Live Ref",
        itemTypeId: itemType.id,
      });
      const archived = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Archived Ref",
        itemTypeId: itemType.id,
      });
      await archiveEntity(dm.id, campaign.id, archived.id);

      expect(await countReferrers(dm.id, campaign.id, itemType.id)).toBe(1);
    });

    it("returns 0 for a type that nothing references", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const npc = await createEntity(dm.id, campaign.id, {
        type: "NPC",
        name: "Unreferenced",
      });

      expect(await countReferrers(dm.id, campaign.id, npc.id)).toBe(0);
    });

    it("returns 0 for a player (DM-only surface)", async () => {
      const dm = await makeUser("dm@test.com");
      const player = await makeUser("player@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      await prisma.membership.create({
        data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
      });
      const itemType = await createEntity(dm.id, campaign.id, {
        type: "ITEM_TYPE",
        name: "Type",
        visibility: "PLAYER_VISIBLE",
      });
      await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Ref",
        visibility: "PLAYER_VISIBLE",
        itemTypeId: itemType.id,
      });

      expect(await countReferrers(player.id, campaign.id, itemType.id)).toBe(0);
    });

    it("returns 0 for a non-member and for a missing entity", async () => {
      const dm = await makeUser("dm@test.com");
      const outsider = await makeUser("outsider@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const itemType = await createEntity(dm.id, campaign.id, {
        type: "ITEM_TYPE",
        name: "Type",
      });

      expect(await countReferrers(outsider.id, campaign.id, itemType.id)).toBe(0);
      expect(await countReferrers(dm.id, campaign.id, "missing-id")).toBe(0);
    });

    it("does not count a reference once its referrer is itself archived (sanity on status filter)", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const itemType = await createEntity(dm.id, campaign.id, {
        type: "ITEM_TYPE",
        name: "Type",
      });
      const onlyRef = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Sole Ref",
        itemTypeId: itemType.id,
      });
      expect(await countReferrers(dm.id, campaign.id, itemType.id)).toBe(1);

      await prisma.entity.update({
        where: { id: onlyRef.id },
        data: { status: CanonStatus.ARCHIVED },
      });
      expect(await countReferrers(dm.id, campaign.id, itemType.id)).toBe(0);
    });
  });

  describe("getCampaignIntegrityReport", () => {
    it("lists campaign-wide broken references and stale data versions for DMs", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const itemType = await createEntity(dm.id, campaign.id, {
        type: "ITEM_TYPE",
        name: "Archived Type",
      });
      const wrongType = await createEntity(dm.id, campaign.id, {
        type: "NPC",
        name: "Not An Item Type",
      });
      const missingRef = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Missing Ref",
        itemTypeId: "missing-target",
      });
      const archivedRef = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Archived Ref",
        itemTypeId: itemType.id,
      });
      const wrongTypeRef = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Wrong Type Ref",
        itemTypeId: wrongType.id,
      });
      await archiveEntity(dm.id, campaign.id, itemType.id);
      const staleFloor = await prisma.entity.create({
        data: {
          campaignId: campaign.id,
          createdById: dm.id,
          type: EntityType.FLOOR,
          name: "Legacy Floor",
          data: { floorNumber: "9", _v: 1 },
        },
        select: { id: true },
      });

      const report = await getCampaignIntegrityReport(dm.id, campaign.id);

      expect(report.checkedEntities).toBe(5);
      expect(report.brokenReferences).toEqual([
        {
          entityId: missingRef.id,
          entityName: "Missing Ref",
          entityType: "ITEM",
          field: "itemTypeId",
          patchKey: "data.itemTypeId",
          targetType: "ITEM_TYPE",
          targetId: "missing-target",
          reason: "MISSING",
        },
        {
          entityId: archivedRef.id,
          entityName: "Archived Ref",
          entityType: "ITEM",
          field: "itemTypeId",
          patchKey: "data.itemTypeId",
          targetType: "ITEM_TYPE",
          targetId: itemType.id,
          reason: "ARCHIVED",
        },
        {
          entityId: wrongTypeRef.id,
          entityName: "Wrong Type Ref",
          entityType: "ITEM",
          field: "itemTypeId",
          patchKey: "data.itemTypeId",
          targetType: "ITEM_TYPE",
          targetId: wrongType.id,
          reason: "WRONG_TYPE",
          actualType: "NPC",
        },
      ]);
      expect(report.staleData).toEqual([
        {
          entityId: staleFloor.id,
          entityName: "Legacy Floor",
          entityType: "FLOOR",
          storedVersion: 1,
          currentVersion: 2,
        },
      ]);
    });

    it("excludes archived referrers and archived stale rows from the campaign report", async () => {
      const dm = await makeUser("dm@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      const archivedReferrer = await createEntity(dm.id, campaign.id, {
        type: "ITEM",
        name: "Archived Referrer",
        itemTypeId: "missing-target",
      });
      const archivedStale = await prisma.entity.create({
        data: {
          campaignId: campaign.id,
          createdById: dm.id,
          type: EntityType.FLOOR,
          name: "Archived Floor",
          data: { floorNumber: "10", _v: 1 },
        },
        select: { id: true },
      });
      await prisma.entity.updateMany({
        where: { id: { in: [archivedReferrer.id, archivedStale.id] } },
        data: { status: CanonStatus.ARCHIVED },
      });

      const report = await getCampaignIntegrityReport(dm.id, campaign.id);

      expect(report).toEqual({
        checkedEntities: 0,
        brokenReferences: [],
        staleData: [],
      });
    });

    it("rejects players and non-members because the report spans hidden canon", async () => {
      const dm = await makeUser("dm@test.com");
      const player = await makeUser("player@test.com");
      const outsider = await makeUser("outsider@test.com");
      const campaign = await createCampaign(dm.id, { name: "Crawl" });
      await prisma.membership.create({
        data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
      });

      await expect(
        getCampaignIntegrityReport(player.id, campaign.id),
      ).rejects.toThrow("Only the DM can view canon integrity.");
      await expect(
        getCampaignIntegrityReport(outsider.id, campaign.id),
      ).rejects.toThrow("You do not have access to this campaign.");
    });
  });
});
