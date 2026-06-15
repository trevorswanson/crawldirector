import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/client";
import type { LLMProvider } from "@/server/ai/types";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createGenericEntity } from "@/server/services/entities";
import {
  EMBED_DIMENSIONS,
  embedSearchDocs,
  embeddingInputForDoc,
  searchVectorLiteral,
} from "@/server/services/embeddings";
import { searchCanon } from "@/server/services/search";

// The embedder is resolved through @/server/ai; mock only that one function so
// the rest of the module (EMBED_MODEL_DEFAULT, describeProviderError, the real
// adapters) stays intact. Tests inject a deterministic stub embedder.
vi.mock("@/server/ai", async (importActual) => {
  const actual = await importActual<typeof import("@/server/ai")>();
  return { ...actual, resolveCampaignEmbedder: vi.fn() };
});

import { EMBED_MODEL_DEFAULT, resolveCampaignEmbedder } from "@/server/ai";

const mockResolveEmbedder = vi.mocked(resolveCampaignEmbedder);

/** A 1536-dim unit vector with a single non-zero entry (orthogonal basis). */
function unit(index: number, dims = EMBED_DIMENSIONS): number[] {
  const vector = new Array<number>(dims).fill(0);
  vector[index] = 1;
  return vector;
}

/**
 * A deterministic stub embedder. `mapText` turns each input (a doc's content at
 * embed time, or the raw query at search time) into a vector, so a test can make
 * a query land near a chosen doc without any real model.
 */
function stubEmbedder(
  mapText: (text: string) => number[],
  opts: { id?: string } = {},
): LLMProvider {
  return {
    id: opts.id ?? "openai",
    model: "gpt-4o-mini",
    generate: vi.fn(),
    generateStructured: vi.fn(),
    embed: vi.fn(async (texts: string[]) => ({
      vectors: texts.map(mapText),
      model: EMBED_MODEL_DEFAULT,
      usage: {
        inputTokens: texts.length * 5,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    })),
  } as unknown as LLMProvider;
}

function makeEntity(
  userId: string,
  campaignId: string,
  overrides: { name: string; summary?: string; visibility?: "DM_ONLY" | "PLAYER_VISIBLE" },
) {
  return createGenericEntity(userId, campaignId, {
    type: "NPC",
    name: overrides.name,
    summary: overrides.summary ?? "",
    description: "",
    visibility: overrides.visibility ?? "PLAYER_VISIBLE",
    tags: [],
  });
}

async function addPlayer(campaignId: string, email: string) {
  const player = await prisma.user.create({ data: { email } });
  await prisma.membership.create({ data: { userId: player.id, campaignId, role: Role.PLAYER } });
  return player;
}

/** Read the stored embedding dimension for a doc (the column is Unsupported in Prisma). */
async function embeddingDims(targetId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ dims: number | null }[]>`
    SELECT vector_dims(embedding) AS dims FROM "SearchDoc" WHERE "targetId" = ${targetId}
  `;
  return rows[0]?.dims ?? null;
}

beforeEach(async () => {
  mockResolveEmbedder.mockReset();
  await prisma.aiUsage.deleteMany();
  await prisma.searchDoc.deleteMany();
  await prisma.crawler.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("embeddingInputForDoc", () => {
  it("returns the content, trimmed", () => {
    expect(embeddingInputForDoc("  Princess Donut\nA royal cat  ")).toBe(
      "Princess Donut\nA royal cat",
    );
  });
});

describe("searchVectorLiteral", () => {
  it("formats a vector as a pgvector literal", () => {
    expect(searchVectorLiteral([0.1, -0.2, 0.3])).toBe("[0.1,-0.2,0.3]");
  });
});

describe("embedSearchDocs", () => {
  it("embeds every doc and stores the vector + model, recording usage", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const a = await makeEntity(dm.id, campaign.id, { name: "Alpha", summary: "one" });
    const b = await makeEntity(dm.id, campaign.id, { name: "Beta", summary: "two" });
    mockResolveEmbedder.mockResolvedValue(stubEmbedder(() => unit(0)));

    const result = await embedSearchDocs(dm.id, campaign.id);
    expect(result).toEqual({ embedded: 2, model: EMBED_MODEL_DEFAULT });

    const docs = await prisma.searchDoc.findMany({
      where: { campaignId: campaign.id },
      select: { targetId: true, embeddingModel: true },
    });
    expect(docs.every((doc) => doc.embeddingModel === EMBED_MODEL_DEFAULT)).toBe(true);
    expect(await embeddingDims(a.id)).toBe(EMBED_DIMENSIONS);
    expect(await embeddingDims(b.id)).toBe(EMBED_DIMENSIONS);

    const usage = await prisma.aiUsage.findMany({ where: { campaignId: campaign.id } });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ generatorId: "embed-search", model: EMBED_MODEL_DEFAULT });
    expect(usage[0].inputTokens).toBeGreaterThan(0);
  });

  it("only re-embeds missing/stale docs by default; force re-embeds all", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await makeEntity(dm.id, campaign.id, { name: "Alpha" });
    await makeEntity(dm.id, campaign.id, { name: "Beta" });
    const embedder = stubEmbedder(() => unit(0));
    mockResolveEmbedder.mockResolvedValue(embedder);

    expect((await embedSearchDocs(dm.id, campaign.id)).embedded).toBe(2);
    expect(embedder.embed).toHaveBeenCalledTimes(1);

    // Second default run: all docs already embedded with this model → no work.
    expect((await embedSearchDocs(dm.id, campaign.id)).embedded).toBe(0);
    expect(embedder.embed).toHaveBeenCalledTimes(1);

    // force re-embeds everything.
    expect((await embedSearchDocs(dm.id, campaign.id, { force: true })).embedded).toBe(2);
    expect(embedder.embed).toHaveBeenCalledTimes(2);
  });

  it("returns 0 without calling the embedder when there are no docs", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Empty" });
    const embedder = stubEmbedder(() => unit(0));
    mockResolveEmbedder.mockResolvedValue(embedder);

    expect((await embedSearchDocs(dm.id, campaign.id)).embedded).toBe(0);
    expect(embedder.embed).not.toHaveBeenCalled();
  });

  it("rejects a player (DM-only)", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");
    mockResolveEmbedder.mockResolvedValue(stubEmbedder(() => unit(0)));

    await expect(embedSearchDocs(player.id, campaign.id)).rejects.toThrow(/permission/i);
  });

  it("throws a ServiceError when no embedding-capable provider is configured", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await makeEntity(dm.id, campaign.id, { name: "Alpha" });
    mockResolveEmbedder.mockResolvedValue(null);

    await expect(embedSearchDocs(dm.id, campaign.id)).rejects.toThrow(
      /No embedding-capable provider/i,
    );
  });

  it("rejects a model whose vectors are the wrong dimension", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await makeEntity(dm.id, campaign.id, { name: "Alpha" });
    mockResolveEmbedder.mockResolvedValue(stubEmbedder(() => unit(0, 768)));

    await expect(embedSearchDocs(dm.id, campaign.id)).rejects.toThrow(/dimensional/i);
  });

  it("blocks when the campaign spend cap is already reached", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    await makeEntity(dm.id, campaign.id, { name: "Alpha" });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { spendCapUsd: 1 } });
    await prisma.aiUsage.create({
      data: {
        campaignId: campaign.id,
        createdById: dm.id,
        providerId: "anthropic",
        model: "claude-opus-4-8",
        generatorId: "flesh-entity",
        inputTokens: 1000,
        outputTokens: 1000,
        estimatedCostUsd: 2,
      },
    });
    const embedder = stubEmbedder(() => unit(0));
    mockResolveEmbedder.mockResolvedValue(embedder);

    await expect(embedSearchDocs(dm.id, campaign.id)).rejects.toThrow(/spend cap/i);
    expect(embedder.embed).not.toHaveBeenCalled();
  });
});

describe("hybrid semantic ranking in searchCanon", () => {
  it("surfaces the closest doc for a query with no keyword overlap", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const beacon = await makeEntity(dm.id, campaign.id, {
      name: "Alpha Beacon",
      summary: "the shining tower on the cliff",
    });
    await makeEntity(dm.id, campaign.id, { name: "Crimson Vault", summary: "a sealed chamber" });

    // "beacon"/"lighthouse" → unit(0); "vault" → unit(1); else far.
    const map = (text: string) => {
      const t = text.toLowerCase();
      if (t.includes("beacon") || t.includes("lighthouse")) return unit(0);
      if (t.includes("vault")) return unit(1);
      return unit(2);
    };
    mockResolveEmbedder.mockResolvedValue(stubEmbedder(map));
    await embedSearchDocs(dm.id, campaign.id);

    // "lighthouse" matches no document's text but is semantically the beacon.
    const hybrid = await searchCanon(dm.id, campaign.id, "lighthouse");
    expect(hybrid.hits.map((h) => h.targetId)).toEqual([beacon.id]);

    // Control: with no embedder it falls back to full-text, which finds nothing.
    mockResolveEmbedder.mockResolvedValue(null);
    const keywordOnly = await searchCanon(dm.id, campaign.id, "lighthouse");
    expect(keywordOnly.hits).toHaveLength(0);
  });

  it("still returns exact keyword hits when embeddings exist", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const goblin = await makeEntity(dm.id, campaign.id, {
      name: "Snortwhistle the Goblin",
      summary: "a grunt",
    });
    mockResolveEmbedder.mockResolvedValue(stubEmbedder(() => unit(5)));
    await embedSearchDocs(dm.id, campaign.id);

    const { hits } = await searchCanon(dm.id, campaign.id, "snortwhistle");
    expect(hits.map((h) => h.targetId)).toContain(goblin.id);
  });

  it("never lets a player's semantic query retrieve a DM-only doc (invariant #5)", async () => {
    const dm = await prisma.user.create({ data: { email: "dm@test.com" } });
    const campaign = await createCampaign(dm.id, { name: "Dungeon" });
    const player = await addPlayer(campaign.id, "player@test.com");
    const secret = await makeEntity(dm.id, campaign.id, {
      name: "The Hidden Cabal",
      summary: "keepers of the lighthouse",
      visibility: "DM_ONLY",
    });

    // Both the secret doc's content and the query map to the same vector, so the
    // doc is the *closest* possible semantic match — only visibility keeps it
    // from the player.
    const map = (text: string) =>
      text.toLowerCase().includes("lighthouse") || text.toLowerCase().includes("beacon")
        ? unit(0)
        : unit(2);
    mockResolveEmbedder.mockResolvedValue(stubEmbedder(map));
    await embedSearchDocs(dm.id, campaign.id);

    const dmResult = await searchCanon(dm.id, campaign.id, "beacon");
    expect(dmResult.hits.map((h) => h.targetId)).toEqual([secret.id]);

    const playerResult = await searchCanon(player.id, campaign.id, "beacon");
    expect(playerResult.role).toBe(Role.PLAYER);
    expect(playerResult.hits).toHaveLength(0);
  });
});
