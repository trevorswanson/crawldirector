import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { JobKind, JobStatus, Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  archiveEntity,
  createGenericEntity,
  updateEntity,
} from "@/server/services/entities";
import {
  archiveRelationship,
  createRelationship,
  updateRelationship,
} from "@/server/services/relationships";
import {
  archiveEvent,
  createEvent,
  updateEvent,
} from "@/server/services/events";
import {
  buildEntityContent,
  buildEventContent,
  buildRelationshipContent,
  reindexCampaign,
} from "@/server/services/search-index";
import { buildSearchDocSearchSql, searchCanon } from "@/server/services/search";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function addPlayer(campaignId: string, email: string) {
  const player = await makeUser(email);
  await prisma.membership.create({
    data: { userId: player.id, campaignId, role: Role.PLAYER },
  });
  return player;
}

function makeEntity(
  userId: string,
  campaignId: string,
  overrides: {
    name: string;
    summary?: string;
    description?: string;
    visibility?: "DM_ONLY" | "PLAYER_VISIBLE";
    tags?: string[];
    type?: "NPC" | "LOCATION";
  },
) {
  return createGenericEntity(userId, campaignId, {
    type: overrides.type ?? "NPC",
    name: overrides.name,
    summary: overrides.summary ?? "",
    description: overrides.description ?? "",
    visibility: overrides.visibility ?? "PLAYER_VISIBLE",
    tags: overrides.tags ?? [],
  });
}

async function addEmbeddingKey(campaignId: string, userId: string) {
  await prisma.aiKey.create({
    data: {
      campaignId,
      createdById: userId,
      providerId: "openai",
      ciphertext: "not-used-by-search-index",
      lastFour: "test",
    },
  });
}

beforeEach(async () => {
  await prisma.job.deleteMany();
  await prisma.searchDoc.deleteMany();
  await prisma.aiKey.deleteMany();
  await prisma.eventCausality.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.relationship.deleteMany();
  await prisma.crawler.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("buildEntityContent", () => {
  it("joins name, summary, description and tags, dropping blanks", () => {
    expect(
      buildEntityContent({
        name: "The Maestro",
        summary: "A manipulative manager",
        description: null,
        tags: ["faction", "boss"],
      }),
    ).toBe("The Maestro\nA manipulative manager\nfaction\nboss");
  });

  it("returns an empty string when every field is blank", () => {
    expect(
      buildEntityContent({ name: "", summary: "  ", description: null, tags: [] }),
    ).toBe("");
  });
});

describe("buildRelationshipContent", () => {
  it("joins the type phrase, both endpoint names and notes, dropping blanks", () => {
    expect(
      buildRelationshipContent({
        typePhrase: "ally of",
        sourceName: "Princess Donut",
        targetName: "Mordecai",
        notes: "trusted partner",
      }),
    ).toBe("ally of\nPrincess Donut\nMordecai\ntrusted partner");
  });

  it("drops blank notes", () => {
    expect(
      buildRelationshipContent({
        typePhrase: "enemy of",
        sourceName: "Carl",
        targetName: "The Maestro",
        notes: null,
      }),
    ).toBe("enemy of\nCarl\nThe Maestro");
  });
});

describe("buildEventContent", () => {
  it("joins title, summary and description, dropping blanks", () => {
    expect(
      buildEventContent({
        title: "The Grand Betrayal",
        summary: "Donut is double-crossed",
        description: null,
      }),
    ).toBe("The Grand Betrayal\nDonut is double-crossed");
  });
});

describe("SearchDoc full-text storage", () => {
  it("stores a generated tsvector column with a GIN index", async () => {
    const [column] = await prisma.$queryRaw<
      {
        columnName: string;
        udtName: string;
        isGenerated: string;
        generationExpression: string | null;
      }[]
    >`
      SELECT
        column_name AS "columnName",
        udt_name AS "udtName",
        is_generated AS "isGenerated",
        generation_expression AS "generationExpression"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'SearchDoc'
        AND column_name = 'searchVector'
    `;

    expect(column).toMatchObject({
      columnName: "searchVector",
      udtName: "tsvector",
      isGenerated: "ALWAYS",
    });
    expect(column.generationExpression).toContain("to_tsvector");
    expect(column.generationExpression).toContain("content");

    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'SearchDoc'
        AND indexname = 'SearchDoc_searchVector_idx'
    `;

    expect(index.indexdef).toContain("USING gin");
    expect(index.indexdef).toContain('"searchVector"');
  });

  it("stores semantic vector dimensions and adds a 1536-dim HNSW cosine index", async () => {
    const [embeddingColumn] = await prisma.$queryRaw<
      { columnName: string; udtName: string; dataType: string }[]
    >`
      SELECT column_name AS "columnName", udt_name AS "udtName", data_type AS "dataType"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'SearchDoc'
        AND column_name = 'embedding'
    `;
    expect(embeddingColumn).toMatchObject({
      columnName: "embedding",
      udtName: "vector",
      dataType: "USER-DEFINED",
    });

    const [dimensionsColumn] = await prisma.$queryRaw<
      { columnName: string; dataType: string; isNullable: string }[]
    >`
      SELECT column_name AS "columnName", data_type AS "dataType", is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'SearchDoc'
        AND column_name = 'embeddingDimensions'
    `;
    expect(dimensionsColumn).toMatchObject({
      columnName: "embeddingDimensions",
      dataType: "integer",
      isNullable: "YES",
    });

    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'SearchDoc'
        AND indexname = 'SearchDoc_embedding_hnsw_1536_idx'
    `;

    expect(index.indexdef).toContain("USING hnsw");
    expect(index.indexdef).toContain("vector_cosine_ops");
    expect(index.indexdef).toContain("vector(1536)");
    expect(index.indexdef).toContain('"embeddingDimensions" = 1536');
  });
});

describe("buildSearchDocSearchSql", () => {
  it("uses the materialized search vector instead of recomputing from content", () => {
    const sql = buildSearchDocSearchSql({
      campaignId: "campaign_1",
      query: "donut OR mordecai",
      playerOnly: true,
      limit: 10,
      offset: 0,
    });
    const text = sql.strings.join("?");

    expect(text).toContain('ts_rank("searchVector", websearch_to_tsquery');
    expect(text).toContain('"searchVector" @@ websearch_to_tsquery');
    expect(text).not.toContain("to_tsvector");
  });

  it("adds an ANN-friendly semantic candidate CTE when a 1536-dim query vector is given", () => {
    const sql = buildSearchDocSearchSql({
      campaignId: "campaign_1",
      query: "lighthouse",
      playerOnly: false,
      limit: 10,
      offset: 0,
      queryVector: [0.1, 0.2, 0.3],
      embedModel: "text-embedding-3-small",
      embedDimensions: 1536,
    });
    const text = sql.strings.join("?");

    // Hybrid: preselect nearest semantic candidates with raw cosine distance so
    // pgvector can use the HNSW expression index, then blend with full-text rank.
    expect(text).toContain("semantic_candidates AS MATERIALIZED");
    expect(text).toContain("ORDER BY embedding::vector(1536) <=>");
    expect(text).toContain('ts_rank("searchVector", websearch_to_tsquery');
    expect(text).toContain("1 - distance AS similarity");
    expect(text).toContain("AND embedding IS NOT NULL");
    expect(text).toContain('AND "embeddingModel" =');
    expect(text).toContain('"embeddingDimensions" =');
    expect(text).toContain('"searchVector" @@ websearch_to_tsquery');
  });

  it("filters semantic candidates by custom embedding dimensions", () => {
    const sql = buildSearchDocSearchSql({
      campaignId: "campaign_1",
      query: "lighthouse",
      playerOnly: false,
      limit: 10,
      offset: 0,
      queryVector: [0.1, 0.2],
      embedModel: "tiny-embed",
      embedDimensions: 2,
    });
    const text = sql.strings.join("?");

    expect(text).toContain("AND embedding IS NOT NULL");
    expect(text).toContain('AND "embeddingModel" =');
    expect(text).toContain('"embeddingDimensions" =');
    expect(text).toContain("ORDER BY embedding <=>");
    expect(text).not.toContain("embedding::vector(1536)");
  });

  it("constrains the candidate scan to the requested targetTypes", () => {
    const filtered = buildSearchDocSearchSql({
      campaignId: "campaign_1",
      query: "lighthouse",
      playerOnly: false,
      limit: 10,
      offset: 0,
      targetTypes: ["ENTITY"],
    }).strings.join("?");
    expect(filtered).toContain('"targetType" IN (');

    const unfiltered = buildSearchDocSearchSql({
      campaignId: "campaign_1",
      query: "lighthouse",
      playerOnly: false,
      limit: 10,
      offset: 0,
    }).strings.join("?");
    expect(unfiltered).not.toContain('"targetType" IN');
  });
});

describe("search indexing on canon writes", () => {
  async function queuedEmbedJobs(campaignId: string) {
    return prisma.job.findMany({
      where: {
        campaignId,
        kind: JobKind.EMBED_SEARCH_DOCS,
        status: JobStatus.QUEUED,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  it("indexes a created entity so it is findable", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const entity = await makeEntity(dm.id, campaign.id, {
      name: "Princess Donut",
      summary: "A royal cat crawler with attitude",
    });

    const doc = await prisma.searchDoc.findFirst({
      where: { targetType: "ENTITY", targetId: entity.id },
    });
    expect(doc).not.toBeNull();
    expect(doc?.campaignId).toBe(campaign.id);

    const { hits } = await searchCanon(dm.id, campaign.id, "royal cat");
    expect(hits.map((h) => h.targetId)).toContain(entity.id);
  });

  it("queues one semantic re-embed job for changed entity docs while a refresh is already pending", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await addEmbeddingKey(campaign.id, dm.id);

    await makeEntity(dm.id, campaign.id, {
      name: "Princess Donut",
      summary: "A royal cat crawler with attitude",
    });

    let jobs = await queuedEmbedJobs(campaign.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      campaignId: campaign.id,
      createdById: dm.id,
      kind: JobKind.EMBED_SEARCH_DOCS,
      payload: {},
      status: JobStatus.QUEUED,
    });

    await makeEntity(dm.id, campaign.id, {
      name: "Mordecai",
      summary: "Trains crawlers in the saferoom",
    });

    jobs = await queuedEmbedJobs(campaign.id);
    expect(jobs).toHaveLength(1);
  });

  it("queues a follow-up semantic refresh when content changes while a refresh is running", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await addEmbeddingKey(campaign.id, dm.id);
    const entity = await makeEntity(dm.id, campaign.id, {
      name: "Running Refresh",
      summary: "old searchable text",
    });
    await prisma.job.updateMany({
      where: { campaignId: campaign.id, kind: JobKind.EMBED_SEARCH_DOCS },
      data: { status: JobStatus.RUNNING, startedAt: new Date() },
    });

    await updateEntity(dm.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Running Refresh",
      summary: "new searchable text",
      description: "",
      visibility: "PLAYER_VISIBLE",
      tags: [],
    });

    expect(await queuedEmbedJobs(campaign.id)).toHaveLength(1);
    expect(
      await prisma.job.count({
        where: {
          campaignId: campaign.id,
          kind: JobKind.EMBED_SEARCH_DOCS,
          status: JobStatus.RUNNING,
        },
      }),
    ).toBe(1);
  });

  it("does not queue semantic refresh work when no embedding-capable key is configured", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });

    await makeEntity(dm.id, campaign.id, {
      name: "Keyword Only",
      summary: "Full-text still works",
    });

    expect(await queuedEmbedJobs(campaign.id)).toHaveLength(0);
  });

  it("re-indexes an updated entity (new text becomes searchable)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const entity = await makeEntity(dm.id, campaign.id, { name: "Mystery NPC" });

    expect((await searchCanon(dm.id, campaign.id, "necromancer")).hits).toHaveLength(0);

    await updateEntity(dm.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Mordecai the Necromancer",
      summary: "Raises the fallen",
      description: "",
      visibility: "PLAYER_VISIBLE",
      tags: [],
    });

    const { hits } = await searchCanon(dm.id, campaign.id, "necromancer");
    expect(hits.map((h) => h.targetId)).toEqual([entity.id]);
  });

  it("does not queue semantic refresh work when only the visibility mirror changes", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await addEmbeddingKey(campaign.id, dm.id);
    const entity = await makeEntity(dm.id, campaign.id, {
      name: "Mirror Only",
      summary: "Searchable text stays put",
      visibility: "PLAYER_VISIBLE",
    });
    await prisma.job.updateMany({
      where: { campaignId: campaign.id, kind: JobKind.EMBED_SEARCH_DOCS },
      data: { status: JobStatus.SUCCEEDED, finishedAt: new Date() },
    });

    await updateEntity(dm.id, campaign.id, entity.id, {
      type: "NPC",
      name: "Mirror Only",
      summary: "Searchable text stays put",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });

    expect(await queuedEmbedJobs(campaign.id)).toHaveLength(0);
  });

  it("drops an archived entity from the index", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const entity = await makeEntity(dm.id, campaign.id, {
      name: "Doomed Goblin",
      summary: "Soon to be removed",
    });
    expect((await searchCanon(dm.id, campaign.id, "goblin")).hits).toHaveLength(1);

    await archiveEntity(dm.id, campaign.id, entity.id);

    expect(
      await prisma.searchDoc.findFirst({ where: { targetId: entity.id } }),
    ).toBeNull();
    expect((await searchCanon(dm.id, campaign.id, "goblin")).hits).toHaveLength(0);
  });
});

describe("relationship indexing on canon writes", () => {
  async function finishEmbedJobs(campaignId: string) {
    await prisma.job.updateMany({
      where: { campaignId, kind: JobKind.EMBED_SEARCH_DOCS },
      data: { status: JobStatus.SUCCEEDED, finishedAt: new Date() },
    });
  }

  async function queuedEmbedJobCount(campaignId: string) {
    return prisma.job.count({
      where: {
        campaignId,
        kind: JobKind.EMBED_SEARCH_DOCS,
        status: JobStatus.QUEUED,
      },
    });
  }

  it("indexes a created relationship so it is findable", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const donut = await makeEntity(dm.id, campaign.id, { name: "Princess Donut" });
    const mordecai = await makeEntity(dm.id, campaign.id, { name: "Mordecai" });

    const { id } = await createRelationship(dm.id, campaign.id, donut.id, {
      type: "ALLY_OF",
      targetId: mordecai.id,
      notes: "zorptastic bond",
      secret: false,
    });

    const doc = await prisma.searchDoc.findFirst({
      where: { targetType: "RELATIONSHIP", targetId: id },
    });
    expect(doc?.campaignId).toBe(campaign.id);
    expect(doc?.visibility).toBe("PLAYER_VISIBLE");

    const { hits } = await searchCanon(dm.id, campaign.id, "zorptastic");
    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit.targetType).toBe("RELATIONSHIP");
    if (hit.targetType !== "RELATIONSHIP") throw new Error("expected relationship hit");
    expect(hit.targetId).toBe(id);
    expect(hit.relationship.sourceEntity.name).toBe("Princess Donut");
    expect(hit.relationship.targetEntity.name).toBe("Mordecai");
    expect(hit.relationship.type).toBe("ALLY_OF");
  });

  it("queues semantic refresh jobs for relationship and event docs", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await addEmbeddingKey(campaign.id, dm.id);
    const donut = await makeEntity(dm.id, campaign.id, { name: "Princess Donut" });
    const mordecai = await makeEntity(dm.id, campaign.id, { name: "Mordecai" });

    await finishEmbedJobs(campaign.id);
    await createRelationship(dm.id, campaign.id, donut.id, {
      type: "ALLY_OF",
      targetId: mordecai.id,
      notes: "semantic edge text",
      secret: false,
    });
    expect(await queuedEmbedJobCount(campaign.id)).toBe(1);

    await finishEmbedJobs(campaign.id);
    await createEvent(dm.id, campaign.id, {
      title: "Semantic Event",
      summary: "semantic event text",
      participants: [{ entityId: donut.id, role: "ACTOR" }],
      secret: false,
    });
    expect(await queuedEmbedJobCount(campaign.id)).toBe(1);
  });

  it("re-indexes an updated relationship (new notes become searchable)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const a = await makeEntity(dm.id, campaign.id, { name: "Alpha" });
    const b = await makeEntity(dm.id, campaign.id, { name: "Beta" });
    const { id } = await createRelationship(dm.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      notes: "original",
      secret: false,
    });

    expect((await searchCanon(dm.id, campaign.id, "necroglyph")).hits).toHaveLength(0);

    await updateRelationship(dm.id, campaign.id, id, {
      type: "ALLY_OF",
      notes: "necroglyph pact",
      secret: false,
    });

    const { hits } = await searchCanon(dm.id, campaign.id, "necroglyph");
    expect(hits.map((h) => h.targetId)).toEqual([id]);
  });

  it("drops an archived relationship from the index", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const a = await makeEntity(dm.id, campaign.id, { name: "Gamma" });
    const b = await makeEntity(dm.id, campaign.id, { name: "Delta" });
    const { id } = await createRelationship(dm.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      notes: "doomededge",
      secret: false,
    });
    expect((await searchCanon(dm.id, campaign.id, "doomededge")).hits).toHaveLength(1);

    await archiveRelationship(dm.id, campaign.id, id);

    expect(
      await prisma.searchDoc.findFirst({ where: { targetId: id } }),
    ).toBeNull();
    expect((await searchCanon(dm.id, campaign.id, "doomededge")).hits).toHaveLength(0);
  });

  it("hides secret edges and edges to hidden endpoints from players (invariant #5)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");

    const visibleA = await makeEntity(dm.id, campaign.id, { name: "Open One" });
    const visibleB = await makeEntity(dm.id, campaign.id, { name: "Open Two" });
    const hidden = await makeEntity(dm.id, campaign.id, {
      name: "Hidden One",
      visibility: "DM_ONLY",
    });

    // A: visible↔visible, open. B: visible↔visible, secret. C: visible↔hidden.
    const open = await createRelationship(dm.id, campaign.id, visibleA.id, {
      type: "ALLY_OF",
      targetId: visibleB.id,
      notes: "edgeword",
      secret: false,
    });
    await createRelationship(dm.id, campaign.id, visibleA.id, {
      type: "ENEMY_OF",
      targetId: visibleB.id,
      notes: "edgeword",
      secret: true,
    });
    await createRelationship(dm.id, campaign.id, visibleA.id, {
      type: "KNOWS_ABOUT",
      targetId: hidden.id,
      notes: "edgeword",
      secret: false,
    });

    const dmResult = await searchCanon(dm.id, campaign.id, "edgeword");
    expect(dmResult.hits).toHaveLength(3);

    const playerResult = await searchCanon(player.id, campaign.id, "edgeword");
    expect(playerResult.hits.map((h) => h.targetId)).toEqual([open.id]);
  });
});

describe("event indexing on canon writes", () => {
  it("indexes a created event so it is findable", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const donut = await makeEntity(dm.id, campaign.id, { name: "Princess Donut" });

    const event = await createEvent(dm.id, campaign.id, {
      title: "The Grand Betrayal",
      summary: "zorpevent unfolds",
      participants: [{ entityId: donut.id, role: "ACTOR" }],
      secret: false,
    });

    const doc = await prisma.searchDoc.findFirst({
      where: { targetType: "EVENT", targetId: event.id },
    });
    expect(doc?.campaignId).toBe(campaign.id);
    expect(doc?.visibility).toBe("PLAYER_VISIBLE");

    const { hits } = await searchCanon(dm.id, campaign.id, "zorpevent");
    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit.targetType).toBe("EVENT");
    if (hit.targetType !== "EVENT") throw new Error("expected event hit");
    expect(hit.targetId).toBe(event.id);
    expect(hit.event.title).toBe("The Grand Betrayal");
  });

  it("re-indexes an updated event (new title becomes searchable)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const donut = await makeEntity(dm.id, campaign.id, { name: "Princess Donut" });
    const event = await createEvent(dm.id, campaign.id, {
      title: "Placeholder Event",
      summary: "before",
      participants: [{ entityId: donut.id, role: "ACTOR" }],
      secret: false,
    });

    expect((await searchCanon(dm.id, campaign.id, "cataclysm")).hits).toHaveLength(0);

    await updateEvent(dm.id, campaign.id, event.id, {
      title: "The Cataclysm",
      summary: "after",
      secret: false,
    });

    const { hits } = await searchCanon(dm.id, campaign.id, "cataclysm");
    expect(hits.map((h) => h.targetId)).toEqual([event.id]);
  });

  it("drops an archived event from the index", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const donut = await makeEntity(dm.id, campaign.id, { name: "Princess Donut" });
    const event = await createEvent(dm.id, campaign.id, {
      title: "Doomed Gathering",
      summary: "vanishingsoon",
      participants: [{ entityId: donut.id, role: "ACTOR" }],
      secret: false,
    });
    expect((await searchCanon(dm.id, campaign.id, "vanishingsoon")).hits).toHaveLength(1);

    await archiveEvent(dm.id, campaign.id, event.id);

    expect(
      await prisma.searchDoc.findFirst({ where: { targetId: event.id } }),
    ).toBeNull();
    expect((await searchCanon(dm.id, campaign.id, "vanishingsoon")).hits).toHaveLength(0);
  });

  it("hides secret events and events with only hidden participants from players (invariant #5)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");

    const visible = await makeEntity(dm.id, campaign.id, { name: "Seen Hero" });
    const hidden = await makeEntity(dm.id, campaign.id, {
      name: "Unseen Villain",
      visibility: "DM_ONLY",
    });

    const open = await createEvent(dm.id, campaign.id, {
      title: "Public Skirmish",
      summary: "eventword",
      participants: [{ entityId: visible.id, role: "ACTOR" }],
      secret: false,
    });
    await createEvent(dm.id, campaign.id, {
      title: "Hidden Meeting",
      summary: "eventword",
      participants: [{ entityId: visible.id, role: "ACTOR" }],
      secret: true,
    });
    await createEvent(dm.id, campaign.id, {
      title: "Villain Scheme",
      summary: "eventword",
      participants: [{ entityId: hidden.id, role: "ACTOR" }],
      secret: false,
    });

    const dmResult = await searchCanon(dm.id, campaign.id, "eventword");
    expect(dmResult.hits).toHaveLength(3);

    const playerResult = await searchCanon(player.id, campaign.id, "eventword");
    expect(playerResult.hits.map((h) => h.targetId)).toEqual([open.id]);
  });
});

describe("searchCanon scoping & ranking", () => {
  it("scopes results to the campaign", async () => {
    const dm = await makeUser("dm@test.com");
    const campaignA = await createCampaign(dm.id, { name: "A" });
    const campaignB = await createCampaign(dm.id, { name: "B" });
    await makeEntity(dm.id, campaignA.id, { name: "Shared Word", summary: "alpha" });
    const inB = await makeEntity(dm.id, campaignB.id, {
      name: "Shared Word",
      summary: "beta",
    });

    const { hits } = await searchCanon(dm.id, campaignB.id, "shared word");
    expect(hits.map((h) => h.targetId)).toEqual([inB.id]);
  });

  it("hides DM-only entities from players (invariant #5)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");

    const secret = await makeEntity(dm.id, campaign.id, {
      name: "Secret Conspiracy",
      summary: "hidden plot",
      visibility: "DM_ONLY",
    });
    const open = await makeEntity(dm.id, campaign.id, {
      name: "Public Conspiracy",
      summary: "open plot",
      visibility: "PLAYER_VISIBLE",
    });

    const dmResult = await searchCanon(dm.id, campaign.id, "conspiracy");
    expect(dmResult.hits.map((h) => h.targetId).sort()).toEqual(
      [secret.id, open.id].sort(),
    );

    const playerResult = await searchCanon(player.id, campaign.id, "conspiracy");
    expect(playerResult.role).toBe(Role.PLAYER);
    expect(playerResult.hits.map((h) => h.targetId)).toEqual([open.id]);
  });

  it("returns no hits for a blank query and reports the role", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await makeEntity(dm.id, campaign.id, { name: "Anything" });

    const result = await searchCanon(dm.id, campaign.id, "   ");
    expect(result.hits).toHaveLength(0);
    expect(result.query).toBe("");
    expect(result.role).toBe(Role.OWNER);
  });

  it("returns an empty result for a non-member", async () => {
    const dm = await makeUser("dm@test.com");
    const stranger = await makeUser("stranger@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await makeEntity(dm.id, campaign.id, { name: "Findable", summary: "treasure" });

    const result = await searchCanon(stranger.id, campaign.id, "treasure");
    expect(result.role).toBeNull();
    expect(result.hits).toHaveLength(0);
  });

  it("honours the result limit", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    for (let i = 0; i < 5; i++) {
      await makeEntity(dm.id, campaign.id, {
        name: `Goblin ${i}`,
        summary: "a goblin grunt",
      });
    }
    const { hits } = await searchCanon(dm.id, campaign.id, "goblin", { limit: 2 });
    expect(hits).toHaveLength(2);
  });

  it("matches against tags", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const tagged = await makeEntity(dm.id, campaign.id, {
      name: "Nondescript",
      tags: ["bopca"],
    });
    const { hits } = await searchCanon(dm.id, campaign.id, "bopca");
    expect(hits.map((h) => h.targetId)).toEqual([tagged.id]);
  });

  it("restricts hits to the requested targetTypes so non-entity matches don't crowd the page", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const a = await makeEntity(dm.id, campaign.id, {
      name: "Stormcaller",
      summary: "sharedterm hero",
    });
    const b = await makeEntity(dm.id, campaign.id, { name: "Tideturner" });
    await createRelationship(dm.id, campaign.id, a.id, {
      type: "ALLY_OF",
      targetId: b.id,
      notes: "sharedterm pact",
      secret: false,
    });

    // Unfiltered, the term matches both the entity and the relationship doc.
    const all = await searchCanon(dm.id, campaign.id, "sharedterm");
    expect(all.hits.map((h) => h.targetType).sort()).toEqual(["ENTITY", "RELATIONSHIP"]);

    // ENTITY-only: the relationship hit is filtered out at the SQL level, so it
    // can't consume the limited candidate window ahead of the entity.
    const entitiesOnly = await searchCanon(dm.id, campaign.id, "sharedterm", {
      targetTypes: ["ENTITY"],
    });
    expect(entitiesOnly.hits).toHaveLength(1);
    expect(entitiesOnly.hits[0].targetType).toBe("ENTITY");
    expect(entitiesOnly.hits[0].targetId).toBe(a.id);
  });
});

describe("reindexCampaign", () => {
  it("rebuilds the entity index from current canon (DM-only)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const entity = await makeEntity(dm.id, campaign.id, {
      name: "Reindexed Knight",
      summary: "a stalwart defender",
    });

    // Wipe the index out from under the campaign, then rebuild it.
    await prisma.searchDoc.deleteMany();
    expect((await searchCanon(dm.id, campaign.id, "stalwart")).hits).toHaveLength(0);

    const { indexed } = await reindexCampaign(dm.id, campaign.id);
    expect(indexed).toBe(1);

    const { hits } = await searchCanon(dm.id, campaign.id, "stalwart");
    expect(hits.map((h) => h.targetId)).toEqual([entity.id]);
  });

  it("rebuilds relationship and event docs too", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const a = await makeEntity(dm.id, campaign.id, { name: "Knight" });
    const b = await makeEntity(dm.id, campaign.id, { name: "Squire" });
    const rel = await createRelationship(dm.id, campaign.id, a.id, {
      type: "MENTOR_OF",
      targetId: b.id,
      notes: "reindexrel",
      secret: false,
    });
    const event = await createEvent(dm.id, campaign.id, {
      title: "Reindex Rite",
      summary: "reindexevt",
      participants: [{ entityId: a.id, role: "ACTOR" }],
      secret: false,
    });

    // Wipe the index out from under the campaign (all three target types).
    await prisma.searchDoc.deleteMany();
    expect((await searchCanon(dm.id, campaign.id, "reindexrel")).hits).toHaveLength(0);
    expect((await searchCanon(dm.id, campaign.id, "reindexevt")).hits).toHaveLength(0);

    // 2 entities + 1 relationship + 1 event.
    const { indexed } = await reindexCampaign(dm.id, campaign.id);
    expect(indexed).toBe(4);

    expect((await searchCanon(dm.id, campaign.id, "reindexrel")).hits.map((h) => h.targetId)).toEqual([
      rel.id,
    ]);
    expect((await searchCanon(dm.id, campaign.id, "reindexevt")).hits.map((h) => h.targetId)).toEqual([
      event.id,
    ]);
  });

  it("rejects a player", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");

    await expect(reindexCampaign(player.id, campaign.id)).rejects.toThrow(
      /permission/i,
    );
  });

  it("clears the index when there is no canon to rebuild", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Empty" });
    const { indexed } = await reindexCampaign(dm.id, campaign.id);
    expect(indexed).toBe(0);
    expect(
      await prisma.searchDoc.count({ where: { campaignId: campaign.id } }),
    ).toBe(0);
  });
});
