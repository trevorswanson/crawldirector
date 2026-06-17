import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/errors";

// Mock the chat-provider seam only. Retrieval (`searchCanon`), the visibility
// projection, usage recording, and the spend cap all run for real against the
// test database — so the invariant-#5 test below proves a player's ask can never
// retrieve DM-only canon, not just that a mock was filtered. `resolveCampaignEmbedder`
// is forced to null so retrieval uses the deterministic full-text path.
const { resolveCampaignProvider, searchCanonMock, searchRef } = vi.hoisted(() => ({
  resolveCampaignProvider: vi.fn(),
  searchCanonMock: vi.fn(),
  // Mutable holder for the real searchCanon, captured in the mock factory below.
  searchRef: { current: null as null | typeof import("@/server/services/search").searchCanon },
}));

vi.mock("@/server/ai", async (importActual) => {
  const actual = await importActual<typeof import("@/server/ai")>();
  return {
    ...actual,
    resolveCampaignProvider,
    resolveCampaignEmbedder: vi.fn().mockResolvedValue(null),
  };
});

// `searchCanon` is wrapped so it runs for real by default (the DB-backed
// visibility tests below depend on the real projection), but can be overridden
// per test to simulate retrieval that spends — e.g. a paid query-embed.
vi.mock("@/server/services/search", async (importActual) => {
  const actual = await importActual<typeof import("@/server/services/search")>();
  searchRef.current = actual.searchCanon;
  return {
    ...actual,
    searchCanon: (...args: Parameters<typeof actual.searchCanon>) => searchCanonMock(...args),
  };
});

import { Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createGenericEntity } from "@/server/services/entities";
import { createRelationship } from "@/server/services/relationships";
import { createEvent } from "@/server/services/events";
import { recordAiUsage, setCampaignSpendCap } from "@/server/services/ai-usage";
import { ASK_RETRIEVAL_LIMIT, askCampaign } from "@/server/services/ask";

const SAMPLE_USAGE = {
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

function fakeProvider(text: string, over: { id?: string; model?: string } = {}) {
  const model = over.model ?? "claude-opus-4-8";
  const providerId = over.id ?? "anthropic";
  return {
    id: providerId,
    model,
    generate: vi.fn().mockResolvedValue({ text, usage: SAMPLE_USAGE, model, providerId }),
    generateStructured: vi.fn(),
    embed: vi.fn(),
  };
}

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
  over: {
    name: string;
    summary?: string;
    description?: string;
    visibility?: "DM_ONLY" | "PLAYER_VISIBLE";
    tags?: string[];
  },
) {
  return createGenericEntity(userId, campaignId, {
    type: "NPC",
    name: over.name,
    summary: over.summary ?? "",
    description: over.description ?? "",
    visibility: over.visibility ?? "PLAYER_VISIBLE",
    tags: over.tags ?? [],
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Default: delegate to the real, DB-backed searchCanon.
  searchCanonMock.mockImplementation((...args: Parameters<NonNullable<typeof searchRef.current>>) =>
    searchRef.current!(...args),
  );
  await prisma.aiUsage.deleteMany();
  await prisma.searchDoc.deleteMany();
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

describe("askCampaign", () => {
  it("synthesizes a grounded, cited answer over retrieved canon", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    const maestro = await makeEntity(dm.id, campaign.id, {
      name: "The Maestro",
      summary: "A manipulative floor manager",
      description: "Pulls the strings behind the throne.",
    });

    const provider = fakeProvider("The Maestro is a manipulative manager [1].");
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await askCampaign(dm.id, campaign.id, "manipulative manager");

    expect(result.grounded).toBe(true);
    expect(result.answer).toContain("[1]");
    expect(result.model).toBe("claude-opus-4-8");
    expect(result.sources.length).toBeGreaterThanOrEqual(1);
    const cited = result.sources.find((s) => s.targetId === maestro.id);
    expect(cited?.cited).toBe(true);
    expect(cited?.href).toBe(`/campaigns/${campaign.id}/entities/${maestro.id}`);

    // The model was handed the retrieved canon as numbered source context.
    const prompt = provider.generate.mock.calls[0][0];
    const userMsg = prompt.messages[0].content;
    expect(userMsg).toContain("The Maestro");
    expect(userMsg).toContain("Pulls the strings behind the throne.");
  });

  it("marks only the sources the model actually cited", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    await makeEntity(dm.id, campaign.id, { name: "Borant Auditor", summary: "Borant bureaucrat" });
    await makeEntity(dm.id, campaign.id, { name: "Borant Liaison", summary: "Borant fixer" });

    resolveCampaignProvider.mockResolvedValue(fakeProvider("Only the first matters [1]."));

    const result = await askCampaign(dm.id, campaign.id, "borant");
    expect(result.sources).toHaveLength(2);
    expect(result.sources.filter((s) => s.cited)).toHaveLength(1);
    expect(result.sources.find((s) => s.index === 1)?.cited).toBe(true);
  });

  // Invariant #5: a player's ask can never retrieve DM-only canon — enforced at
  // retrieval, so the DM-only doc never even reaches the model's context.
  it("never lets a player's ask retrieve DM-only canon (invariant #5)", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    const publicCult = await makeEntity(dm.id, campaign.id, {
      name: "Throne Pilgrims",
      summary: "Open worshippers of the throne",
      visibility: "PLAYER_VISIBLE",
    });
    const secretCult = await makeEntity(dm.id, campaign.id, {
      name: "Secret Throne Cabal",
      summary: "Hidden plotters of the throne",
      visibility: "DM_ONLY",
    });
    const player = await addPlayer(campaign.id, "player@example.com");

    const provider = fakeProvider("The throne has worshippers [1].");
    resolveCampaignProvider.mockResolvedValue(provider);

    // DM sees both; player sees only the public one.
    const dmResult = await askCampaign(dm.id, campaign.id, "throne");
    expect(dmResult.sources.map((s) => s.targetId).sort()).toEqual(
      [publicCult.id, secretCult.id].sort(),
    );

    const playerResult = await askCampaign(player.id, campaign.id, "throne");
    expect(playerResult.sources.map((s) => s.targetId)).toEqual([publicCult.id]);

    // The DM-only doc never reached the player's synthesis context.
    const playerPrompt = provider.generate.mock.calls.at(-1)![0];
    expect(playerPrompt.messages[0].content).not.toContain("Secret Throne Cabal");
    expect(playerPrompt.messages[0].content).not.toContain("Hidden plotters");
    expect(playerPrompt.messages[0].content).toContain("answering for a player");
  });

  it("returns a canon-is-silent answer without a provider call when nothing matches", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    await makeEntity(dm.id, campaign.id, { name: "The Maestro", summary: "A manager" });

    const provider = fakeProvider("unused");
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await askCampaign(dm.id, campaign.id, "zzzznomatchanywhere");
    expect(result.grounded).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.answer).toMatch(/couldn't find anything/i);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("throws a safe error when no chat provider is configured", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    await makeEntity(dm.id, campaign.id, { name: "The Maestro", summary: "A manager" });
    resolveCampaignProvider.mockResolvedValue(null);

    await expect(askCampaign(dm.id, campaign.id, "manager")).rejects.toThrow(ServiceError);
  });

  it("rejects a blank or oversized question", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    resolveCampaignProvider.mockResolvedValue(fakeProvider("x"));

    await expect(askCampaign(dm.id, campaign.id, "   ")).rejects.toThrow(ServiceError);
    await expect(askCampaign(dm.id, campaign.id, "x".repeat(5000))).rejects.toThrow(ServiceError);
  });

  it("turns a provider failure into a safe ServiceError (invariant #6)", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    await makeEntity(dm.id, campaign.id, { name: "The Maestro", summary: "A manager" });
    const provider = fakeProvider("unused");
    provider.generate.mockRejectedValue({ status: 401, message: "x-api-key: sk-leak" });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(askCampaign(dm.id, campaign.id, "manager")).rejects.toThrow(ServiceError);
    await expect(askCampaign(dm.id, campaign.id, "manager")).rejects.not.toThrow(/sk-leak/);
  });

  it("rejects a non-member", async () => {
    const dm = await makeUser("dm@example.com");
    const outsider = await makeUser("outsider@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    resolveCampaignProvider.mockResolvedValue(fakeProvider("x"));

    await expect(askCampaign(outsider.id, campaign.id, "anything")).rejects.toThrow(ServiceError);
  });

  it("refuses once the spend cap is reached, before any provider call", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    await makeEntity(dm.id, campaign.id, { name: "The Maestro", summary: "A manager" });
    await setCampaignSpendCap(dm.id, campaign.id, 0.01);
    // A priced run that already exceeds the cap.
    await recordAiUsage({
      campaignId: campaign.id,
      userId: dm.id,
      providerId: "anthropic",
      model: "claude-opus-4-8",
      generatorId: "flesh-entity",
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheCreationTokens: 0 },
    });

    const provider = fakeProvider("unused");
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(askCampaign(dm.id, campaign.id, "manager")).rejects.toThrow(ServiceError);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("re-checks the cap after retrieval spends (query-embed), before synthesis", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    await setCampaignSpendCap(dm.id, campaign.id, 0.01);

    // Below the cap when Ask starts, so the pre-retrieval check passes — but
    // retrieval (simulating a paid query-embed) records spend that reaches the
    // cap and returns a hit. The post-retrieval re-check must then block.
    searchCanonMock.mockImplementation(async (userId: string, campaignId: string) => {
      await recordAiUsage({
        campaignId,
        userId,
        providerId: "openai",
        model: "claude-opus-4-8",
        generatorId: "search-query-embed",
        usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      });
      return {
        role: Role.OWNER,
        query: "throne",
        hits: [
          {
            targetType: "ENTITY" as const,
            targetId: "e1",
            rank: 1,
            entity: {
              id: "e1",
              type: "NPC" as const,
              name: "X",
              summary: null,
              status: "CANON" as const,
              source: "DM" as const,
              tags: [],
              isStub: false,
            },
          },
        ],
      };
    });

    const provider = fakeProvider("unused");
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(askCampaign(dm.id, campaign.id, "throne")).rejects.toThrow(ServiceError);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("records an ask-campaign usage row for the answer", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    await makeEntity(dm.id, campaign.id, { name: "The Maestro", summary: "A manager" });
    resolveCampaignProvider.mockResolvedValue(fakeProvider("Answer [1]."));

    await askCampaign(dm.id, campaign.id, "manager");

    const usage = await prisma.aiUsage.findMany({
      where: { campaignId: campaign.id, generatorId: "ask-campaign" },
    });
    expect(usage).toHaveLength(1);
    expect(usage[0].outputTokens).toBe(SAMPLE_USAGE.outputTokens);
  });

  it("cites relationship and event sources, linking to graph and timeline", async () => {
    const dm = await makeUser("dm@example.com");
    const campaign = await createCampaign(dm.id, { name: "Doomed Run" });
    const carl = await makeEntity(dm.id, campaign.id, { name: "Carl", summary: "A crawler" });
    const donut = await makeEntity(dm.id, campaign.id, { name: "Donut", summary: "A cat" });
    const rel = await createRelationship(dm.id, campaign.id, carl.id, {
      type: "ALLY_OF",
      targetId: donut.id,
      notes: "zorptastic bond",
      secret: false,
    });
    const event = await createEvent(dm.id, campaign.id, {
      title: "Zorptastic Gathering",
      summary: "A zorptastic meeting",
      participants: [{ entityId: carl.id, role: "ACTOR" }],
      secret: false,
    });

    resolveCampaignProvider.mockResolvedValue(fakeProvider("Both matter [1][2]."));

    const result = await askCampaign(dm.id, campaign.id, "zorptastic");

    const relSource = result.sources.find((s) => s.targetId === rel.id);
    const eventSource = result.sources.find((s) => s.targetId === event.id);
    expect(relSource?.targetType).toBe("RELATIONSHIP");
    expect(relSource?.kind).toBe("Relationship");
    expect(relSource?.href).toBe(`/campaigns/${campaign.id}/graph`);
    expect(relSource?.label).toContain("Carl");
    expect(relSource?.label).toContain("Donut");
    expect(eventSource?.targetType).toBe("EVENT");
    expect(eventSource?.kind).toBe("Event");
    expect(eventSource?.href).toBe(`/campaigns/${campaign.id}/timeline`);
    expect(eventSource?.label).toBe("Zorptastic Gathering");
  });

  it("retrieves at most ASK_RETRIEVAL_LIMIT sources", async () => {
    expect(ASK_RETRIEVAL_LIMIT).toBeGreaterThan(0);
    expect(ASK_RETRIEVAL_LIMIT).toBeLessThanOrEqual(50);
  });
});
