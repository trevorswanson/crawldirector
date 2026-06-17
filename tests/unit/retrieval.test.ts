import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createGenericEntity } from "@/server/services/entities";
import { createRelationship } from "@/server/services/relationships";
import {
  buildEntityRetrievalQuery,
  retrieveRelatedEntityIds,
} from "@/server/services/retrieval";

// Retrieval seam over `searchCanon` (M5 slice 6 — docs/07-search-retrieval.md).
// No provider mock: with no AI key configured `resolveCampaignEmbedder` returns
// null inside `searchCanon`, so these exercise the full-text retrieval path that
// every campaign gets for free.

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

function makeEntity(
  userId: string,
  campaignId: string,
  overrides: {
    name: string;
    summary?: string;
    tags?: string[];
    visibility?: "DM_ONLY" | "PLAYER_VISIBLE";
  },
) {
  return createGenericEntity(userId, campaignId, {
    type: "NPC",
    name: overrides.name,
    summary: overrides.summary ?? "",
    description: "",
    visibility: overrides.visibility ?? "DM_ONLY",
    tags: overrides.tags ?? [],
  });
}

beforeEach(async () => {
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.searchDoc.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("buildEntityRetrievalQuery", () => {
  it("OR-joins the name and tags so the full-text arm matches any shared term", () => {
    expect(buildEntityRetrievalQuery({ name: "Quasar", tags: ["cosmic", "void"] })).toBe(
      "Quasar or cosmic or void",
    );
  });

  it("trims and drops blank terms", () => {
    expect(buildEntityRetrievalQuery({ name: " Quasar ", tags: [" ", "cosmic"] })).toBe(
      "Quasar or cosmic",
    );
  });

  it("returns an empty query when there is nothing to seed on", () => {
    expect(buildEntityRetrievalQuery({ name: "   ", tags: [] })).toBe("");
  });
});

describe("retrieveRelatedEntityIds", () => {
  it("returns term-sharing entities and excludes the seed itself", async () => {
    const dm = await makeUser("dm@retrieval.test");
    const campaign = await createCampaign(dm.id, { name: "Storms" });
    const target = await makeEntity(dm.id, campaign.id, { name: "Nimbus", tags: ["storm"] });
    const related = await makeEntity(dm.id, campaign.id, {
      name: "Tempest",
      summary: "A storm bringer.",
    });
    const unrelated = await makeEntity(dm.id, campaign.id, {
      name: "Pebble",
      summary: "A small rock.",
    });

    const ids = await retrieveRelatedEntityIds(dm.id, campaign.id, {
      id: target.id,
      name: "Nimbus",
      tags: ["storm"],
    });

    expect(ids).toContain(related.id);
    expect(ids).not.toContain(target.id);
    expect(ids).not.toContain(unrelated.id);
  });

  it("scopes to the requester's visibility — a player never retrieves DM-only canon (invariant #5)", async () => {
    const dm = await makeUser("dm2@retrieval.test");
    const campaign = await createCampaign(dm.id, { name: "Fog" });
    const player = await makeUser("player@retrieval.test");
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    const target = await makeEntity(dm.id, campaign.id, { name: "Nimbus", tags: ["storm"] });
    const visible = await makeEntity(dm.id, campaign.id, {
      name: "Tempest",
      summary: "A storm bringer.",
      visibility: "PLAYER_VISIBLE",
    });
    const hidden = await makeEntity(dm.id, campaign.id, {
      name: "Shadow",
      summary: "A storm in the dark.",
      visibility: "DM_ONLY",
    });

    const seed = { id: target.id, name: "Nimbus", tags: ["storm"] };
    const dmIds = await retrieveRelatedEntityIds(dm.id, campaign.id, seed);
    const playerIds = await retrieveRelatedEntityIds(player.id, campaign.id, seed);

    expect(dmIds).toEqual(expect.arrayContaining([visible.id, hidden.id]));
    expect(playerIds).toContain(visible.id);
    expect(playerIds).not.toContain(hidden.id);
  });

  it("still retrieves a relevant entity when relationship docs also match the seed term", async () => {
    const dm = await makeUser("dm4@retrieval.test");
    const campaign = await createCampaign(dm.id, { name: "Mixed" });
    const target = await makeEntity(dm.id, campaign.id, { name: "Nimbus", tags: ["storm"] });
    const related = await makeEntity(dm.id, campaign.id, {
      name: "Tempest",
      summary: "A storm bringer.",
    });
    // A relationship whose notes also match "storm" — it must not consume the
    // candidate window ahead of the entity (the seam scans ENTITY docs only).
    await createRelationship(dm.id, campaign.id, target.id, {
      type: "ALLY_OF",
      targetId: related.id,
      notes: "a storm-forged pact",
      secret: false,
    });

    const ids = await retrieveRelatedEntityIds(dm.id, campaign.id, {
      id: target.id,
      name: "Nimbus",
      tags: ["storm"],
    });
    expect(ids).toContain(related.id);
  });

  it("returns nothing for a non-member or a seed with no terms", async () => {
    const dm = await makeUser("dm3@retrieval.test");
    const stranger = await makeUser("stranger@retrieval.test");
    const campaign = await createCampaign(dm.id, { name: "Closed" });
    const target = await makeEntity(dm.id, campaign.id, { name: "Nimbus", tags: ["storm"] });
    await makeEntity(dm.id, campaign.id, { name: "Tempest", summary: "A storm bringer." });

    expect(
      await retrieveRelatedEntityIds(stranger.id, campaign.id, {
        id: target.id,
        name: "Nimbus",
        tags: ["storm"],
      }),
    ).toEqual([]);
    expect(
      await retrieveRelatedEntityIds(dm.id, campaign.id, { id: target.id, name: "", tags: [] }),
    ).toEqual([]);
  });
});
