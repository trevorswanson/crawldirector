import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ChangeSource, EventParticipantRole, Visibility } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { ProviderError } from "@/server/ai/types";

// Mock the provider seam only — no SDK, no network. The generation
// orchestration, the generator's prompt/patch logic, and the review pipeline all
// run for real against the test database.
const { resolveCampaignProvider, resolveCampaignEmbedder } = vi.hoisted(() => ({
  resolveCampaignProvider: vi.fn(),
  resolveCampaignEmbedder: vi.fn(),
}));

// Partial mock: stub the chat-provider seam (no SDK, no network) and default
// retrieval's embedder to null, so ordinary tests use real full-text search.
// `describeProviderError` and all review/DB behavior remain real; the dedicated
// spend-cap test opts into a fake embedder to exercise paid retrieval.
vi.mock("@/server/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai")>()),
  resolveCampaignProvider,
  resolveCampaignEmbedder,
}));

import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createCrawler, createGenericEntity } from "@/server/services/entities";
import { createEvent, setEventLock } from "@/server/services/events";
import {
  fleshOutEntities,
  fleshOutEntity,
  generateDungeonContent,
  inferRelationshipsForEntity,
  proposeEventConsequences,
  scaffoldStubEntities,
} from "@/server/services/generation";
import {
  applyAutoApprovedEventChangeSet,
  approveChangeSet,
  setEntityLock,
} from "@/server/services/review";
import { createPersonaSnapshot } from "@/server/services/persona";
import { recordAiUsage, setCampaignSpendCap } from "@/server/services/ai-usage";

const SAMPLE_USAGE = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

function fakeProvider(
  data: { summary: string; description: string; tags: string[] },
  over: { id?: string; model?: string } = {},
) {
  const model = over.model ?? "claude-opus-4-8";
  return {
    id: over.id ?? "anthropic",
    model,
    generate: vi.fn(),
    generateStructured: vi.fn().mockResolvedValue({ data, usage: SAMPLE_USAGE, model }),
  };
}

async function makeUser(email: string, name?: string) {
  return prisma.user.create({ data: { email, name } });
}

async function makeStub(userId: string, campaignId: string, name: string) {
  return createGenericEntity(userId, campaignId, {
    type: "NPC",
    name,
    summary: "",
    description: "",
    visibility: "DM_ONLY",
    tags: ["existing"],
  });
}

async function seed() {
  const dm = await makeUser("dm@test.com", "DM");
  const player = await makeUser("player@test.com", "Player");
  const campaign = await createCampaign(dm.id, { name: "Dungeon" });
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { styleGuide: "Gritty and darkly funny." },
  });
  await prisma.membership.create({
    data: { userId: player.id, campaignId: campaign.id, role: "PLAYER" },
  });
  const entity = await makeStub(dm.id, campaign.id, "Mordecai");
  return { dmId: dm.id, playerId: player.id, campaignId: campaign.id, entityId: entity.id };
}

beforeEach(async () => {
  vi.clearAllMocks();
  resolveCampaignEmbedder.mockResolvedValue(null);
  await prisma.aiUsage.deleteMany();
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.eventCausality.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.personaSnapshot.deleteMany();
  await prisma.event.deleteMany();
  await prisma.crawler.deleteMany();
  await prisma.searchDoc.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeConsequenceCrawler(userId: string, campaignId: string, name = "Carl") {
  return createCrawler(userId, campaignId, {
    name,
    summary: "A crawler in trouble.",
    description: "",
    visibility: Visibility.DM_ONLY,
    tags: [],
    level: 1,
    gold: 100,
    viewCount: BigInt(0),
    followerCount: BigInt(0),
    favoriteCount: BigInt(0),
    killCount: 0,
    isAlive: true,
  });
}

async function makeConsequenceEvent(
  userId: string,
  campaignId: string,
  title: string,
  participants: Array<{ entityId: string; role: EventParticipantRole }> = [],
) {
  return createEvent(userId, campaignId, {
    title,
    summary: "The Dungeon makes its move.",
    basis: "COLLAPSE",
    offset: 5,
    secret: false,
    participants,
  });
}

function fakeConsequenceProvider(data: unknown, over: { id?: string; model?: string } = {}) {
  const model = over.model ?? "claude-opus-4-8";
  return {
    id: over.id ?? "anthropic",
    model,
    generate: vi.fn(),
    generateStructured: vi.fn().mockResolvedValue({ data, usage: SAMPLE_USAGE, model }),
  };
}

describe("proposeEventConsequences", () => {
  it("files review-only crawler effects and causal links, then applies them only after approval", async () => {
    const { dmId, campaignId } = await seed();
    const crawler = await makeConsequenceCrawler(dmId, campaignId);
    const source = await makeConsequenceEvent(dmId, campaignId, "Arena ambush", [
      { entityId: crawler.id, role: EventParticipantRole.ACTOR },
    ]);
    const consequence = await makeConsequenceEvent(dmId, campaignId, "Arena aftermath");
    const provider = fakeConsequenceProvider({
      effects: [
        {
          kind: "ADJUST_STAT",
          targetEntityId: crawler.id,
          stat: "gold",
          delta: 25,
          note: "The loot payout lands.",
        },
      ],
      causalLinks: [{ effectEventId: consequence.id, weight: 1, note: "The ambush causes it." }],
    });
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await proposeEventConsequences(dmId, campaignId, source.id);

    expect(result).toMatchObject({
      providerId: "anthropic",
      model: "claude-opus-4-8",
      operationCount: 2,
    });
    const proposal = await prisma.changeSet.findUniqueOrThrow({
      where: { id: result.changeSetId },
      include: { operations: true },
    });
    expect(proposal).toMatchObject({
      status: "PENDING",
      source: ChangeSource.AI,
      providerId: "anthropic",
      model: "claude-opus-4-8",
      promptId: "event-consequences",
      promptVersion: "1",
    });
    expect(proposal.operations.map((operation) => operation.op).sort()).toEqual([
      "APPLY_EVENT_EFFECTS",
      "CREATE_EVENT_CAUSALITY",
    ]);
    await expect(prisma.event.findUniqueOrThrow({ where: { id: source.id } })).resolves.toMatchObject({
      effects: [],
    });
    await expect(prisma.crawler.findUniqueOrThrow({ where: { id: crawler.id } })).resolves.toMatchObject({
      gold: 100,
    });
    expect(
      await prisma.eventCausality.count({ where: { campaignId, causeId: source.id, effectId: consequence.id } }),
    ).toBe(0);

    await prisma.changeOperation.updateMany({
      where: { changeSetId: result.changeSetId, decision: "PENDING" },
      data: { decision: "ACCEPTED" },
    });
    await approveChangeSet(dmId, campaignId, result.changeSetId);

    await expect(prisma.crawler.findUniqueOrThrow({ where: { id: crawler.id } })).resolves.toMatchObject({
      gold: 125,
    });
    await expect(
      prisma.eventCausality.findFirst({ where: { campaignId, causeId: source.id, effectId: consequence.id } }),
    ).resolves.not.toBeNull();
  });

  it("proposes a persona shift for an active System AI and preserves AI provenance on approval", async () => {
    const { dmId, campaignId } = await seed();
    const system = await createGenericEntity(dmId, campaignId, {
      type: "SYSTEM_AI",
      name: "The System",
      summary: "Dungeon intelligence.",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await createPersonaSnapshot(dmId, campaignId, system.id, {
      label: "Broadcast Host",
      dials: { resentment: 25, theatricality: 50 },
      values: [],
      overtAgendas: [],
      secretAgendas: [],
      resources: [],
      knowledgeScope: "OMNISCIENT",
      voiceGuide: "Cruelly enthusiastic.",
      constraints: "",
      isActive: true,
    });
    const source = await makeConsequenceEvent(dmId, campaignId, "The System watches", [
      { entityId: system.id, role: EventParticipantRole.ACTOR },
    ]);
    resolveCampaignProvider.mockResolvedValue(
      fakeConsequenceProvider({
        effects: [
          {
            kind: "PERSONA_SHIFT",
            targetEntityId: system.id,
            dialShifts: { resentment: 15 },
            note: "The ratings turn ugly.",
          },
        ],
        causalLinks: [],
      }),
    );

    const result = await proposeEventConsequences(dmId, campaignId, source.id);
    const proposal = await prisma.changeSet.findUniqueOrThrow({
      where: { id: result.changeSetId },
      include: { operations: true },
    });
    const patch = proposal.operations[0]!.patch as { effects: { to: Array<{ targetEntityId: string }> } };
    expect(patch.effects.to[0]!.targetEntityId).toBe(system.id);
    await prisma.changeOperation.updateMany({
      where: { changeSetId: result.changeSetId },
      data: { decision: "ACCEPTED" },
    });
    await approveChangeSet(dmId, campaignId, result.changeSetId);

    const snapshots = await prisma.personaSnapshot.findMany({
      where: { campaignId, entityId: system.id },
      orderBy: { createdAt: "asc" },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toMatchObject({ isActive: true, source: ChangeSource.AI });
    await expect(
      prisma.provenance.findFirst({
        where: { personaSnapshotId: snapshots[1]!.id, changeSetId: result.changeSetId, source: ChangeSource.AI },
      }),
    ).resolves.not.toBeNull();
  });

  it("rejects players and locked source events before resolving a provider", async () => {
    const { dmId, playerId, campaignId } = await seed();
    const source = await makeConsequenceEvent(dmId, campaignId, "Broadcast interruption");
    const provider = fakeConsequenceProvider({ effects: [], causalLinks: [] });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(proposeEventConsequences(playerId, campaignId, source.id)).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(resolveCampaignProvider).not.toHaveBeenCalled();

    await setEventLock(dmId, campaignId, source.id, true);
    await expect(proposeEventConsequences(dmId, campaignId, source.id)).rejects.toThrow(/locked/i);
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });

  it("rejects a missing provider before the model call", async () => {
    const { dmId, campaignId } = await seed();
    const source = await makeConsequenceEvent(dmId, campaignId, "No provider event");
    resolveCampaignProvider.mockResolvedValue(null);

    await expect(proposeEventConsequences(dmId, campaignId, source.id)).rejects.toThrow(/No AI provider/i);
  });

  it("rejects a missing source event before resolving a provider", async () => {
    const { dmId, campaignId } = await seed();
    await expect(proposeEventConsequences(dmId, campaignId, "missing-event")).rejects.toThrow(
      /Event not found/i,
    );
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });

  it("rejects a source with no eligible target or existing consequence event", async () => {
    const { dmId, campaignId } = await seed();
    const source = await makeConsequenceEvent(dmId, campaignId, "Isolated note");
    const provider = fakeConsequenceProvider({ effects: [], causalLinks: [] });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(proposeEventConsequences(dmId, campaignId, source.id)).rejects.toThrow(
      /eligible crawler.*existing event/i,
    );
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("does not offer a System AI without an active persona as an effect target", async () => {
    const { dmId, campaignId } = await seed();
    const system = await createGenericEntity(dmId, campaignId, {
      type: "SYSTEM_AI",
      name: "Dormant System",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    const source = await makeConsequenceEvent(dmId, campaignId, "Dormant broadcast", [
      { entityId: system.id, role: EventParticipantRole.ACTOR },
    ]);
    const provider = fakeConsequenceProvider({ effects: [], causalLinks: [] });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(proposeEventConsequences(dmId, campaignId, source.id)).rejects.toThrow(
      /eligible crawler.*existing event/i,
    );
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("reaches the model for a collapsible-floor source with no other candidates", async () => {
    const { dmId, campaignId } = await seed();
    const source = await createEvent(dmId, campaignId, {
      title: "The floor buckles",
      summary: "The Dungeon makes its move.",
      basis: "COLLAPSE",
      offset: 5,
      floor: 3,
      secret: false,
      participants: [],
    });
    const provider = fakeConsequenceProvider({
      effects: [{ kind: "COLLAPSE_FLOOR", note: "The floor falls." }],
      causalLinks: [],
    });
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await proposeEventConsequences(dmId, campaignId, source.id);

    expect(result).toMatchObject({ operationCount: 1 });
    const prompt = provider.generateStructured.mock.calls[0]![0].messages[0].content as string;
    expect(prompt).toContain("COLLAPSE_FLOOR allowed: yes");
    const proposal = await prisma.changeSet.findUniqueOrThrow({
      where: { id: result.changeSetId },
      include: { operations: true },
    });
    expect(proposal.operations.map((operation) => operation.op)).toEqual(["APPLY_EVENT_EFFECTS"]);
    const patch = proposal.operations[0]!.patch as { effects: { to: Array<{ kind: string }> } };
    expect(patch.effects.to[0]!.kind).toBe("COLLAPSE_FLOOR");
  });

  it("surfaces a provider failure safely without a proposal or usage record", async () => {
    const { dmId, campaignId } = await seed();
    const crawler = await makeConsequenceCrawler(dmId, campaignId);
    const source = await makeConsequenceEvent(dmId, campaignId, "Provider failure", [
      { entityId: crawler.id, role: EventParticipantRole.ACTOR },
    ]);
    const provider = fakeConsequenceProvider({ effects: [], causalLinks: [] });
    provider.generateStructured.mockRejectedValue({ status: 500, message: "x-api-key: sk-leak" });
    resolveCampaignProvider.mockResolvedValue(provider);

    const error = await proposeEventConsequences(dmId, campaignId, source.id).catch((caught) => caught);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.message).not.toContain("sk-leak");
    expect(await prisma.changeSet.count({ where: { campaignId, source: ChangeSource.AI } })).toBe(0);
    expect(await prisma.aiUsage.count({ where: { campaignId } })).toBe(0);
  });

  it("records paid usage but files no proposal when all model ids are unusable", async () => {
    const { dmId, campaignId } = await seed();
    const source = await makeConsequenceEvent(dmId, campaignId, "Invalid ids");
    await makeConsequenceEvent(dmId, campaignId, "A valid causal candidate");
    resolveCampaignProvider.mockResolvedValue(
      fakeConsequenceProvider({
        effects: [{ kind: "SET_ALIVE", targetEntityId: "not-a-crawler", value: false }],
        causalLinks: [{ effectEventId: "not-an-event" }],
      }),
    );

    await expect(proposeEventConsequences(dmId, campaignId, source.id)).rejects.toThrow(/usable/i);
    expect(await prisma.changeSet.count({ where: { campaignId, source: ChangeSource.AI } })).toBe(0);
    const usages = await prisma.aiUsage.findMany({ where: { campaignId } });
    expect(usages).toHaveLength(1);
    expect(usages[0]!.changeSetId).toBeNull();
  });

  it("filters existing causal links and collapse proposals when collapse preflight fails", async () => {
    const { dmId, campaignId } = await seed();
    const source = await makeConsequenceEvent(dmId, campaignId, "Unanchored floor event");
    const consequence = await makeConsequenceEvent(dmId, campaignId, "Existing consequence");
    await applyAutoApprovedEventChangeSet(dmId, campaignId, {
      title: "Record existing causality",
      operations: [
        {
          op: "CREATE_EVENT_CAUSALITY",
          patch: {
            causeId: { to: source.id },
            effectId: { to: consequence.id },
          },
        },
      ],
    });
    const provider = fakeConsequenceProvider({
      effects: [{ kind: "COLLAPSE_FLOOR", note: "The floor falls." }],
      causalLinks: [{ effectEventId: consequence.id }],
    });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(proposeEventConsequences(dmId, campaignId, source.id)).rejects.toThrow(/usable/i);
    const prompt = provider.generateStructured.mock.calls[0]![0].messages[0].content as string;
    expect(prompt).toContain("COLLAPSE_FLOOR allowed: no");
    expect(await prisma.aiUsage.count({ where: { campaignId } })).toBe(1);
  });

  it("re-checks the spend cap after retrieval spends on a query embedding", async () => {
    const { dmId, campaignId } = await seed();
    const crawler = await makeConsequenceCrawler(dmId, campaignId);
    const source = await makeConsequenceEvent(dmId, campaignId, "Embedding cap", [
      { entityId: crawler.id, role: EventParticipantRole.ACTOR },
    ]);
    const provider = fakeConsequenceProvider({ effects: [], causalLinks: [] });
    resolveCampaignProvider.mockResolvedValue(provider);
    resolveCampaignEmbedder.mockResolvedValue({
      id: "openai",
      model: "gpt-4o-mini",
      embeddingModel: "gpt-4o-mini",
      embeddingDimensions: 1536,
      generate: vi.fn(),
      generateStructured: vi.fn(),
      embed: vi.fn().mockResolvedValue({
        vectors: [Array.from({ length: 1536 }, () => 0.01)],
        model: "gpt-4o-mini",
        usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      }),
      redactSecrets: (value: string) => value,
    });
    await setCampaignSpendCap(dmId, campaignId, 0.01);

    await expect(proposeEventConsequences(dmId, campaignId, source.id)).rejects.toThrow(/spend cap/i);
    expect(provider.generateStructured).not.toHaveBeenCalled();
    await expect(
      prisma.aiUsage.findFirst({ where: { campaignId, generatorId: "search-query-embed" } }),
    ).resolves.not.toBeNull();
  });
});

describe("fleshOutEntity", () => {
  it("files a PENDING AI proposal carrying the provider/model/prompt metadata", async () => {
    const { dmId, campaignId, entityId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "A grizzled guide.", description: "Long lore here.", tags: ["guide", "ally"] }),
    );

    const result = await fleshOutEntity(dmId, campaignId, entityId);

    expect(result).toMatchObject({ providerId: "anthropic", model: "claude-opus-4-8" });

    const changeSet = await prisma.changeSet.findUnique({
      where: { id: result.changeSetId },
      include: { operations: true },
    });
    expect(changeSet?.status).toBe("PENDING");
    expect(changeSet?.source).toBe("AI");
    expect(changeSet?.providerId).toBe("anthropic");
    expect(changeSet?.model).toBe("claude-opus-4-8");
    expect(changeSet?.promptId).toBe("flesh-entity");
    expect(changeSet?.promptVersion).toBe("3");
    // No System AI persona authored → no persona attribution on the change set.
    expect(changeSet?.personaSnapshotId).toBeNull();
    expect(changeSet?.personaPromptVersion).toBeNull();
    expect(changeSet?.operations).toHaveLength(1);
    const op = changeSet!.operations[0];
    expect(op.op).toBe("UPDATE_ENTITY");
    expect(op.targetId).toBe(entityId);
    const patch = op.patch as Record<string, { to: unknown }>;
    expect(patch.summary.to).toBe("A grizzled guide.");
    expect(patch.description.to).toBe("Long lore here.");
    expect(patch.tags.to).toEqual(["guide", "ally"]);
  });

  it("passes the campaign style guide and other entities' tags into the prompt", async () => {
    const { dmId, campaignId, entityId } = await seed();
    // A sibling entity contributes a campaign tag the generator should offer for reuse.
    await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Donut",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["floor-9"],
    });
    const provider = fakeProvider({ summary: "s", description: "d", tags: ["t"] });
    resolveCampaignProvider.mockResolvedValue(provider);

    await fleshOutEntity(dmId, campaignId, entityId);

    const req = provider.generateStructured.mock.calls[0][0];
    const systemText = (req.system as Array<{ text: string }>).map((b) => b.text).join("\n");
    expect(systemText).toContain("Gritty and darkly funny.");
    expect(req.messages[0].content).toContain("Existing campaign tags to prefer: floor-9");
  });

  async function authorActivePersona(dmId: string, campaignId: string) {
    const systemAi = await createGenericEntity(dmId, campaignId, {
      type: "SYSTEM_AI",
      name: "The System",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await createPersonaSnapshot(dmId, campaignId, systemAi.id, {
      label: "Petty God",
      dials: { theatricality: 90 },
      values: [],
      overtAgendas: ["Make it a show."],
      secretAgendas: ["Undermine Borant."],
      resources: [],
      knowledgeScope: "OMNISCIENT",
      voiceGuide: "Grandiose and petty.",
      constraints: "",
      isActive: true,
    });
  }

  it("injects the active System AI persona for dungeon-voiced kinds and records it (M6)", async () => {
    const { dmId, campaignId } = await seed();
    await authorActivePersona(dmId, campaignId);
    const boss = await createGenericEntity(dmId, campaignId, {
      type: "BOSS",
      name: "The Maitre D'",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    const provider = fakeProvider({ summary: "s", description: "d", tags: ["t"] });
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await fleshOutEntity(dmId, campaignId, boss.id);

    const systemText = (
      provider.generateStructured.mock.calls[0][0].system as Array<{ text: string }>
    )
      .map((b) => b.text)
      .join("\n");
    expect(systemText).toContain("System AI persona: Petty God");
    expect(systemText).toMatch(/System AI's current voice/i);
    // The secret agenda is in the DM-side prompt (informs tone); never player output.
    expect(systemText).toContain("Undermine Borant.");

    const changeSet = await prisma.changeSet.findUniqueOrThrow({
      where: { id: result.changeSetId },
    });
    expect(changeSet.personaSnapshotId).toBeTruthy();
    expect(changeSet.personaPromptVersion).toBe(1);

    // Provenance is written on approval — approving the AI proposal copies the
    // driving persona onto each field's Provenance row.
    const op = await prisma.changeOperation.findFirstOrThrow({
      where: { changeSetId: result.changeSetId },
    });
    await prisma.changeOperation.update({
      where: { id: op.id },
      data: { decision: "ACCEPTED" },
    });
    await approveChangeSet(dmId, campaignId, result.changeSetId);
    const provenance = await prisma.provenance.findFirst({
      where: { changeSetId: result.changeSetId },
    });
    expect(provenance?.personaSnapshotId).toBe(changeSet.personaSnapshotId);
  });

  it("does not inject the persona when fleshing a non-voiced kind", async () => {
    const { dmId, campaignId, entityId } = await seed(); // entityId is an NPC
    await authorActivePersona(dmId, campaignId);
    const provider = fakeProvider({ summary: "s", description: "d", tags: ["t"] });
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await fleshOutEntity(dmId, campaignId, entityId);

    const systemText = (
      provider.generateStructured.mock.calls[0][0].system as Array<{ text: string }>
    )
      .map((b) => b.text)
      .join("\n");
    expect(systemText).not.toContain("System AI persona");
    const changeSet = await prisma.changeSet.findUniqueOrThrow({
      where: { id: result.changeSetId },
    });
    expect(changeSet.personaSnapshotId).toBeNull();
  });

  it("carries retrieval-surfaced related canon as reference, excluding unrelated entities", async () => {
    const { dmId, campaignId, entityId } = await seed();
    // The target (Mordecai) seeds tag "existing"; this entity shares it, so the
    // OR-joined retrieval query ("Mordecai or existing") surfaces it as related.
    await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Grimaldi the Mapmaker",
      summary: "A shifty guide working the same floor.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["existing"],
    });
    // Shares no term with the query — must NOT crowd the reference context.
    await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Zarathustra",
      summary: "A reclusive astronomer in a far-off tower.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["cosmic"],
    });
    const provider = fakeProvider({ summary: "s", description: "d", tags: ["t"] });
    resolveCampaignProvider.mockResolvedValue(provider);

    await fleshOutEntity(dmId, campaignId, entityId);

    const user = provider.generateStructured.mock.calls[0][0].messages[0].content as string;
    expect(user).toContain("Related canon (reference");
    expect(user).toContain("Grimaldi the Mapmaker: A shifty guide working the same floor.");
    expect(user).not.toContain("Zarathustra");
  });

  it("surfaces a description-only related entity's canon (retrieved on a description match)", async () => {
    const { dmId, campaignId, entityId } = await seed();
    // Summary empty; its only tie to the target is a fact in the description, which
    // SearchDoc indexes — so retrieval surfaces it and the fallback must carry that
    // fact into the prompt rather than render "(no summary yet)" (Codex P2, PR #142).
    await createGenericEntity(dmId, campaignId, {
      type: "ITEM",
      name: "Old Chronicle",
      summary: "",
      description: "A dusty ledger recording Mordecai's debts across the dungeon.",
      visibility: "DM_ONLY",
      tags: [],
    });
    const provider = fakeProvider({ summary: "s", description: "d", tags: ["t"] });
    resolveCampaignProvider.mockResolvedValue(provider);

    await fleshOutEntity(dmId, campaignId, entityId);

    const user = provider.generateStructured.mock.calls[0][0].messages[0].content as string;
    expect(user).toContain("Old Chronicle:");
    expect(user).toContain("dusty ledger recording Mordecai's debts");
    expect(user).not.toContain("Old Chronicle: (no summary yet)");
  });

  it("includes a locked related entity as read-only reference (unlike relationship inference)", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const related = await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Grimaldi the Mapmaker",
      summary: "A shifty guide working the same floor.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["existing"],
    });
    // Fully locked canon is read-only, but flesh-out still uses it as reference —
    // it only ever proposes against its own target, so this can't violate #2.
    await setEntityLock(dmId, campaignId, related.id, { locked: true });
    const provider = fakeProvider({ summary: "s", description: "d", tags: ["t"] });
    resolveCampaignProvider.mockResolvedValue(provider);

    await fleshOutEntity(dmId, campaignId, entityId);

    const user = provider.generateStructured.mock.calls[0][0].messages[0].content as string;
    expect(user).toContain("Grimaldi the Mapmaker");
  });

  it("never proposes a locked field", async () => {
    const { dmId, campaignId, entityId } = await seed();
    await setEntityLock(dmId, campaignId, entityId, { lockedFields: ["summary"] });
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "should be dropped", description: "kept", tags: ["kept"] }),
    );

    const result = await fleshOutEntity(dmId, campaignId, entityId);
    const op = await prisma.changeOperation.findFirst({
      where: { changeSet: { id: result.changeSetId } },
    });
    const patch = op!.patch as Record<string, unknown>;
    expect(patch.summary).toBeUndefined();
    expect(patch.description).toBeDefined();
  });

  it("refuses to generate against a fully locked entity (no provider call)", async () => {
    const { dmId, campaignId, entityId } = await seed();
    await setEntityLock(dmId, campaignId, entityId, { locked: true });
    resolveCampaignProvider.mockResolvedValue(fakeProvider({ summary: "x", description: "y", tags: [] }));

    await expect(fleshOutEntity(dmId, campaignId, entityId)).rejects.toThrow(/locked/i);
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });

  it("errors when no provider is configured", async () => {
    const { dmId, campaignId, entityId } = await seed();
    resolveCampaignProvider.mockResolvedValue(null);
    await expect(fleshOutEntity(dmId, campaignId, entityId)).rejects.toThrow(/No AI provider/i);
  });

  it("errors when the model proposes no changes — but still records the paid run", async () => {
    const { dmId, campaignId, entityId } = await seed();
    // The entity already has these exact values (empty summary/description, tag "existing").
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "", description: "", tags: ["existing"] }),
    );
    await expect(fleshOutEntity(dmId, campaignId, entityId)).rejects.toThrow(/any changes/i);
    expect(await prisma.changeSet.count({ where: { source: "AI" } })).toBe(0);
    // The provider call spent tokens, so usage is recorded even though no proposal
    // was filed — it counts toward spend + the cap (changeSetId stays null).
    const usageRows = await prisma.aiUsage.findMany({ where: { campaignId } });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0].changeSetId).toBeNull();
    expect(usageRows[0].inputTokens).toBe(1_000_000);
  });

  it("denies a player", async () => {
    const { playerId, campaignId, entityId } = await seed();
    resolveCampaignProvider.mockResolvedValue(fakeProvider({ summary: "x", description: "y", tags: [] }));
    await expect(fleshOutEntity(playerId, campaignId, entityId)).rejects.toBeInstanceOf(ServiceError);
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });

  it("surfaces a ProviderError as a safe ServiceError without filing a proposal", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const provider = fakeProvider({ summary: "x", description: "y", tags: [] });
    provider.generateStructured.mockRejectedValue(
      new ProviderError("The model did not return data matching the expected schema."),
    );
    resolveCampaignProvider.mockResolvedValue(provider);

    const err = await fleshOutEntity(dmId, campaignId, entityId).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.message).toMatch(/did not return data/);
    expect(await prisma.changeSet.count({ where: { source: "AI" } })).toBe(0);
  });

  it("translates a raw SDK error into a generic safe message", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const provider = fakeProvider({ summary: "x", description: "y", tags: [] });
    provider.generateStructured.mockRejectedValue({ status: 500, message: "x-api-key: sk-leak" });
    resolveCampaignProvider.mockResolvedValue(provider);

    const err = await fleshOutEntity(dmId, campaignId, entityId).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.message).not.toContain("sk-leak");
  });

  it("records AI provenance (source + model) on each field when the proposal is approved", async () => {
    const { dmId, campaignId, entityId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "A grizzled guide.", description: "Lore.", tags: ["guide"] }),
    );
    const { changeSetId } = await fleshOutEntity(dmId, campaignId, entityId);

    await prisma.changeOperation.updateMany({
      where: { changeSetId, decision: "PENDING" },
      data: { decision: "ACCEPTED" },
    });
    await approveChangeSet(dmId, campaignId, changeSetId);

    // Invariant #3: provenance is permanent and answers "where did this come
    // from?" — the approved AI fields carry the source + model.
    const aiProv = await prisma.provenance.findMany({
      where: { entityId, source: "AI" },
    });
    expect(aiProv.length).toBeGreaterThan(0);
    expect(aiProv.every((p) => p.model === "claude-opus-4-8")).toBe(true);
    expect(aiProv.map((p) => p.field).sort()).toContain("summary");

    const entity = await prisma.entity.findUnique({ where: { id: entityId } });
    expect(entity?.summary).toBe("A grizzled guide.");
  });
});

describe("inferRelationshipsForEntity", () => {
  it("files a PENDING AI relationship proposal carrying provider/model/prompt metadata", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const other = await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Princess Donut",
      summary: "A fellow guide.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["guide"],
    });
    resolveCampaignProvider.mockResolvedValue({
      id: "anthropic",
      model: "claude-opus-4-8",
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          relationships: [
            {
              sourceEntityId: entityId,
              targetEntityId: other.id,
              type: "MENTOR_OF",
              disposition: 60,
              notes: "Mordecai guides Donut through early crawler politics.",
              secret: false,
            },
          ],
        },
      }),
    });

    const result = await inferRelationshipsForEntity(dmId, campaignId, entityId);

    expect(result).toMatchObject({
      providerId: "anthropic",
      model: "claude-opus-4-8",
      operationCount: 1,
    });
    expect(await prisma.relationship.count()).toBe(0);

    const changeSet = await prisma.changeSet.findUnique({
      where: { id: result.changeSetId },
      include: { operations: true },
    });
    expect(changeSet?.status).toBe("PENDING");
    expect(changeSet?.source).toBe("AI");
    expect(changeSet?.providerId).toBe("anthropic");
    expect(changeSet?.model).toBe("claude-opus-4-8");
    expect(changeSet?.promptId).toBe("infer-relationships");
    expect(changeSet?.promptVersion).toBe("1");
    expect(changeSet?.operations).toHaveLength(1);
    const op = changeSet!.operations[0];
    expect(op.op).toBe("CREATE_RELATIONSHIP");
    const patch = op.patch as Record<string, { to: unknown }>;
    expect(patch.sourceId.to).toBe(entityId);
    expect(patch.targetId.to).toBe(other.id);
    expect(patch.type.to).toBe("MENTOR_OF");
    expect(patch.notes.to).toContain("Mordecai guides Donut");
  });

  it("passes candidate entities and existing target relationships into the prompt", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const other = await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Princess Donut",
      summary: "A fellow guide.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["guide"],
    });
    await prisma.relationship.create({
      data: {
        campaignId,
        sourceId: entityId,
        targetId: other.id,
        type: "MENTOR_OF",
        status: "CANON",
      },
    });
    const provider = fakeProvider({ summary: "unused", description: "unused", tags: [] });
    provider.generateStructured.mockResolvedValue({ data: { relationships: [] } });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(inferRelationshipsForEntity(dmId, campaignId, entityId)).rejects.toThrow(/relationships/i);

    const req = provider.generateStructured.mock.calls[0][0];
    const user = req.messages[0].content;
    expect(user).toContain("Princess Donut");
    expect(user).toContain(`${entityId} --MENTOR_OF--> ${other.id}`);
  });

  it("refuses a locked target entity before calling the provider", async () => {
    const { dmId, campaignId, entityId } = await seed();
    await setEntityLock(dmId, campaignId, entityId, { locked: true });
    resolveCampaignProvider.mockResolvedValue(fakeProvider({ summary: "x", description: "y", tags: [] }));

    await expect(inferRelationshipsForEntity(dmId, campaignId, entityId)).rejects.toThrow(/locked/i);
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });

  it("does not offer locked candidate endpoints to the model", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const locked = await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Locked NPC",
      summary: "Should stay out of AI proposals.",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    const open = await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Open NPC",
      summary: "Available endpoint.",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await setEntityLock(dmId, campaignId, locked.id, { locked: true });
    const provider = fakeProvider({ summary: "unused", description: "unused", tags: [] });
    provider.generateStructured.mockResolvedValue({ data: { relationships: [] } });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(inferRelationshipsForEntity(dmId, campaignId, entityId)).rejects.toThrow(/relationships/i);

    const user = provider.generateStructured.mock.calls[0][0].messages[0].content;
    expect(user).not.toContain("Locked NPC");
    expect(user).not.toContain(locked.id);
    expect(user).toContain("Open NPC");
    expect(user).toContain(open.id);
  });

  it("orders retrieval-relevant candidates ahead of the alphabetical baseline", async () => {
    // Replaces the old alphabetical candidate dump: at scale the related entities
    // rarely fall in the first N alphabetically (M5 slice 6 — retrieval context).
    const { dmId, campaignId } = await seed();
    const target = await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Quasar",
      summary: "A cosmic guide.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["cosmic"],
    });
    // Alphabetically first, but shares nothing with the target.
    await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Aardvark",
      summary: "Just a critter.",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    // Alphabetically last, but shares the target's distinctive term.
    await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Zenith",
      summary: "A cosmic ally.",
      description: "",
      visibility: "DM_ONLY",
      tags: ["cosmic"],
    });
    const provider = fakeProvider({ summary: "unused", description: "unused", tags: [] });
    provider.generateStructured.mockResolvedValue({ data: { relationships: [] } });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(inferRelationshipsForEntity(dmId, campaignId, target.id)).rejects.toThrow(
      /relationships/i,
    );

    const user = provider.generateStructured.mock.calls[0][0].messages[0].content;
    // Both are offered (baseline keeps coverage), but the term-sharing "Zenith"
    // is ranked ahead of the alphabetically-earlier, unrelated "Aardvark".
    expect(user).toContain("Zenith");
    expect(user).toContain("Aardvark");
    expect(user.indexOf("Zenith")).toBeLessThan(user.indexOf("Aardvark"));
  });

  it("suppresses relationship proposals that duplicate pending relationship creates", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const other = await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Princess Donut",
      summary: "A fellow guide.",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await prisma.changeSet.create({
      data: {
        campaignId,
        source: "AI",
        title: "Existing pending relationship",
        actorUserId: dmId,
        operations: {
          create: {
            op: "CREATE_RELATIONSHIP",
            targetType: "RELATIONSHIP",
            patch: {
              type: { to: "MENTOR_OF" },
              sourceId: { to: entityId },
              targetId: { to: other.id },
              secret: { to: false },
            },
          },
        },
      },
    });
    resolveCampaignProvider.mockResolvedValue({
      id: "anthropic",
      model: "claude-opus-4-8",
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          relationships: [
            { sourceEntityId: entityId, targetEntityId: other.id, type: "MENTOR_OF", secret: false },
          ],
        },
      }),
    });

    await expect(inferRelationshipsForEntity(dmId, campaignId, entityId)).rejects.toThrow(
      /relationships/i,
    );
    expect(await prisma.changeSet.count({ where: { title: `Infer relationships for Mordecai` } })).toBe(0);
  });

  it("refuses a model result with no usable relationship proposals", async () => {
    const { dmId, campaignId, entityId } = await seed();
    resolveCampaignProvider.mockResolvedValue({
      id: "anthropic",
      model: "claude-opus-4-8",
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          relationships: [
            { sourceEntityId: entityId, targetEntityId: entityId, type: "RIVAL_OF", secret: false },
          ],
        },
      }),
    });

    await expect(inferRelationshipsForEntity(dmId, campaignId, entityId)).rejects.toThrow(
      /relationships/i,
    );
    expect(await prisma.changeSet.count({ where: { source: "AI" } })).toBe(0);
  });

  it("records AI provenance on relationship fields after approval", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const other = await createGenericEntity(dmId, campaignId, {
      type: "NPC",
      name: "Princess Donut",
      summary: "A fellow guide.",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    resolveCampaignProvider.mockResolvedValue({
      id: "anthropic",
      model: "claude-opus-4-8",
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          relationships: [
            { sourceEntityId: entityId, targetEntityId: other.id, type: "MENTOR_OF", secret: false },
          ],
        },
      }),
    });

    const { changeSetId } = await inferRelationshipsForEntity(dmId, campaignId, entityId);
    await prisma.changeOperation.updateMany({
      where: { changeSetId, decision: "PENDING" },
      data: { decision: "ACCEPTED" },
    });
    await approveChangeSet(dmId, campaignId, changeSetId);

    const edge = await prisma.relationship.findFirstOrThrow({ where: { campaignId } });
    const provenance = await prisma.provenance.findMany({ where: { relationshipId: edge.id } });
    expect(provenance.length).toBeGreaterThan(0);
    expect(provenance.every((p) => p.source === "AI")).toBe(true);
    expect(provenance.every((p) => p.model === "claude-opus-4-8")).toBe(true);
    expect(provenance.map((p) => p.promptId)).toContain("infer-relationships");
  });

  it("denies a player without calling the provider", async () => {
    const { playerId, campaignId, entityId } = await seed();
    resolveCampaignProvider.mockResolvedValue(fakeProvider({ summary: "x", description: "y", tags: [] }));

    await expect(inferRelationshipsForEntity(playerId, campaignId, entityId)).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });
});

type ScaffoldStub = { type: string; name: string; summary?: string; tags?: string[] };

function fakeStubProvider(stubs: ScaffoldStub[], over: { id?: string; model?: string } = {}) {
  return {
    id: over.id ?? "anthropic",
    model: over.model ?? "claude-opus-4-8",
    generate: vi.fn(),
    generateStructured: vi.fn().mockResolvedValue({ data: { stubs } }),
  };
}

describe("scaffoldStubEntities", () => {
  it("files a single PENDING change set of CREATE_ENTITY stub proposals with provenance", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeStubProvider([
        { type: "NPC", name: "Grimm the Tailor", summary: "Sews cursed cloaks.", tags: ["vendor"] },
        { type: "LOCATION", name: "Rag & Bone Stall", tags: [] },
      ]),
    );

    const result = await scaffoldStubEntities(dmId, campaignId, "The Bone Market vendors.");

    expect(result).toMatchObject({ providerId: "anthropic", model: "claude-opus-4-8", stubCount: 2 });
    // Nothing becomes canon (invariant #1): no new live entities beyond the seed.
    expect(await prisma.entity.count({ where: { campaignId, status: "CANON" } })).toBe(1);

    const changeSet = await prisma.changeSet.findUnique({
      where: { id: result.changeSetId },
      include: { operations: true },
    });
    expect(changeSet?.status).toBe("PENDING");
    expect(changeSet?.source).toBe("AI");
    expect(changeSet?.promptId).toBe("scaffold-stubs");
    expect(changeSet?.promptVersion).toBe("2");
    expect(changeSet?.operations).toHaveLength(2);
    expect(changeSet?.operations.every((o) => o.op === "CREATE_ENTITY")).toBe(true);
    // Operations come back without a stable sort key (no orderBy), so assert on
    // the set of names rather than positional order — Postgres may return either.
    const patches = changeSet!.operations.map(
      (o) => o.patch as Record<string, { to: unknown }>,
    );
    expect(patches.map((p) => p.name.to).sort()).toEqual(
      ["Grimm the Tailor", "Rag & Bone Stall"].sort(),
    );
    const grimm = patches.find((p) => p.name.to === "Grimm the Tailor")!;
    expect(grimm.type.to).toBe("NPC");
    expect(grimm.isStub.to).toBe(true);
    expect(grimm.visibility.to).toBe("DM_ONLY");
  });

  it("passes the style guide, existing names, and tags into the prompt", async () => {
    const { dmId, campaignId } = await seed();
    const provider = fakeStubProvider([{ type: "NPC", name: "Fresh" }]);
    resolveCampaignProvider.mockResolvedValue(provider);

    await scaffoldStubEntities(dmId, campaignId, "More NPCs.");

    const req = provider.generateStructured.mock.calls[0][0];
    const systemText = (req.system as Array<{ text: string }>).map((b) => b.text).join("\n");
    expect(systemText).toContain("Gritty and darkly funny.");
    const user = req.messages[0].content;
    expect(user).toContain("More NPCs.");
    // The seeded "Mordecai" (tag "existing") is offered as a dup to avoid + tag to reuse.
    expect(user).toContain("Mordecai");
    expect(user).toContain("existing");
  });

  it("drops a stub whose name duplicates existing canon", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeStubProvider([
        { type: "NPC", name: "mordecai" }, // dup of the seeded entity (case-insensitive)
        { type: "NPC", name: "Brand New" },
      ]),
    );

    const result = await scaffoldStubEntities(dmId, campaignId, "Townsfolk.");
    expect(result.stubCount).toBe(1);
    const ops = await prisma.changeOperation.findMany({ where: { changeSetId: result.changeSetId } });
    expect((ops[0].patch as Record<string, { to: unknown }>).name.to).toBe("Brand New");
  });

  it("bounds existing-name prompt context but still drops post-hoc canon duplicates", async () => {
    const { dmId, campaignId } = await seed();
    await prisma.entity.createMany({
      data: [
        ...Array.from({ length: 120 }, (_, index) => ({
          campaignId,
          type: "NPC" as const,
          name: `Existing ${String(index).padStart(3, "0")}`,
          tags: ["bulk"],
        })),
        {
          campaignId,
          type: "NPC" as const,
          name: "Zzz Out Of Prompt",
          tags: ["late"],
        },
      ],
    });
    const provider = fakeStubProvider([
      { type: "NPC", name: "zzz out of prompt" },
      { type: "NPC", name: "Fresh Late" },
    ]);
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await scaffoldStubEntities(dmId, campaignId, "More late NPCs.");

    const user = provider.generateStructured.mock.calls[0][0].messages[0].content;
    expect(user).toContain("Existing 000");
    expect(user).not.toContain("Zzz Out Of Prompt");
    expect(result.stubCount).toBe(1);
    const ops = await prisma.changeOperation.findMany({
      where: { changeSetId: result.changeSetId },
    });
    expect(ops.map((op) => (op.patch as Record<string, { to: unknown }>).name.to)).toEqual([
      "Fresh Late",
    ]);
  });

  it("rejects an empty instruction without calling the provider", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(fakeStubProvider([{ type: "NPC", name: "X" }]));
    await expect(scaffoldStubEntities(dmId, campaignId, "   ")).rejects.toThrow(/scaffold/i);
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });

  it("rejects an over-long instruction without calling the provider", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(fakeStubProvider([{ type: "NPC", name: "X" }]));
    await expect(scaffoldStubEntities(dmId, campaignId, "x".repeat(2001))).rejects.toThrow(/too long/i);
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });

  it("errors when no provider is configured", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(null);
    await expect(scaffoldStubEntities(dmId, campaignId, "Things.")).rejects.toThrow(/No AI provider/i);
  });

  it("errors when the model proposes nothing usable", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(fakeStubProvider([]));
    await expect(scaffoldStubEntities(dmId, campaignId, "Things.")).rejects.toThrow(/usable/i);
    expect(await prisma.changeSet.count({ where: { source: "AI" } })).toBe(0);
  });

  it("surfaces a ProviderError as a safe ServiceError without filing a proposal", async () => {
    const { dmId, campaignId } = await seed();
    const provider = fakeStubProvider([{ type: "NPC", name: "X" }]);
    provider.generateStructured.mockRejectedValue(new ProviderError("schema mismatch"));
    resolveCampaignProvider.mockResolvedValue(provider);

    const err = await scaffoldStubEntities(dmId, campaignId, "Things.").catch((e) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.message).toMatch(/schema mismatch/);
    expect(await prisma.changeSet.count({ where: { source: "AI" } })).toBe(0);
  });

  it("denies a player without calling the provider", async () => {
    const { playerId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(fakeStubProvider([{ type: "NPC", name: "X" }]));
    await expect(scaffoldStubEntities(playerId, campaignId, "Things.")).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });

  it("creates the stubs as AI-sourced canon with provenance when approved", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeStubProvider([{ type: "NPC", name: "Grimm the Tailor", summary: "Sews cloaks.", tags: ["vendor"] }]),
    );
    const { changeSetId } = await scaffoldStubEntities(dmId, campaignId, "Vendors.");

    await prisma.changeOperation.updateMany({
      where: { changeSetId, decision: "PENDING" },
      data: { decision: "ACCEPTED" },
    });
    await approveChangeSet(dmId, campaignId, changeSetId);

    const created = await prisma.entity.findFirst({ where: { campaignId, name: "Grimm the Tailor" } });
    expect(created).not.toBeNull();
    expect(created?.source).toBe("AI");
    expect(created?.isStub).toBe(true);
    const prov = await prisma.provenance.findMany({ where: { entityId: created!.id, source: "AI" } });
    expect(prov.length).toBeGreaterThan(0);
    expect(prov.every((p) => p.model === "claude-opus-4-8")).toBe(true);
    expect(prov.map((p) => p.promptId)).toContain("scaffold-stubs");
  });
});

describe("generation — usage tracking & spend caps", () => {
  it("records an AiUsage row (tokens, model, cost, change set) after a successful run", async () => {
    const { dmId, campaignId, entityId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "A grizzled guide.", description: "Long lore.", tags: ["guide"] }),
    );

    const { changeSetId } = await fleshOutEntity(dmId, campaignId, entityId);

    const rows = await prisma.aiUsage.findMany({ where: { campaignId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      providerId: "anthropic",
      model: "claude-opus-4-8",
      generatorId: "flesh-entity",
      changeSetId,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    // 1M input ($15) + 1M output ($75) on opus.
    expect(rows[0].estimatedCostUsd).toBeCloseTo(90, 6);
    // The usage record carries no API key (invariant #6).
    expect(JSON.stringify(rows[0])).not.toMatch(/sk-/);
  });

  it("blocks generation once the campaign spend cap is reached", async () => {
    const { dmId, campaignId, entityId } = await seed();
    await setCampaignSpendCap(dmId, campaignId, 50);
    // Pre-existing spend ($90) already exceeds the $50 cap.
    await recordAiUsage({
      campaignId,
      userId: dmId,
      providerId: "anthropic",
      model: "claude-opus-4-8",
      generatorId: "flesh-entity",
      usage: SAMPLE_USAGE,
    });

    const provider = fakeProvider({ summary: "x", description: "y", tags: ["z"] });
    resolveCampaignProvider.mockResolvedValue(provider);

    await expect(fleshOutEntity(dmId, campaignId, entityId)).rejects.toMatchObject({
      message: expect.stringContaining("spend cap"),
    });
    // The provider was never called, and no new usage row was written.
    expect(provider.generateStructured).not.toHaveBeenCalled();
    expect(await prisma.aiUsage.count({ where: { campaignId } })).toBe(1);
  });
});

describe("generation — concurrency / spend-cap serialization", () => {
  it(
    "cap race regression: exactly one of two concurrent fleshOutEntity calls succeeds when cap fits only one run",
    async () => {
      const { dmId, campaignId, entityId } = await seed();
      const second = await makeStub(dmId, campaignId, "Donut");

      // Cap of $50: a single claude-opus-4-8 run at 1M+1M tokens costs $90,
      // so the first run (spending $0→$90) exceeds the cap on subsequent checks
      // but passes an initial $0 check. With the lock, the second run sees $90
      // already spent and is blocked. Without the lock, both see $0 and both pass.
      await setCampaignSpendCap(dmId, campaignId, 50);

      // Add ~50ms artificial delay to the provider so both calls are in-flight
      // long enough for the race window to matter.
      const slowProvider = fakeProvider(
        { summary: "A grizzled guide.", description: "Long lore.", tags: ["guide"] },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (slowProvider.generateStructured as any).mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return {
          data: { summary: "A grizzled guide.", description: "Long lore.", tags: ["guide"] },
          usage: SAMPLE_USAGE,
          model: "claude-opus-4-8",
        };
      });
      resolveCampaignProvider.mockResolvedValue(slowProvider);

      const results = await Promise.allSettled([
        fleshOutEntity(dmId, campaignId, entityId),
        fleshOutEntity(dmId, campaignId, second.id),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.message).toMatch(/spend cap/i);

      // Only one usage row should exist — the second run never called the provider.
      const usageRows = await prisma.aiUsage.findMany({ where: { campaignId } });
      expect(usageRows).toHaveLength(1);
    },
    10_000,
  );

  it(
    "bulk + single interleave smoke: fleshOutEntities(2) concurrent with fleshOutEntity completes without deadlock",
    async () => {
      const { dmId, campaignId, entityId } = await seed();
      const second = await makeStub(dmId, campaignId, "Donut");
      const third = await makeStub(dmId, campaignId, "Carl");

      resolveCampaignProvider.mockResolvedValue(
        fakeProvider({ summary: "Richer.", description: "Lore.", tags: ["ally"] }),
      );

      // Run a bulk batch of 2 AND a single in parallel — the single must not
      // deadlock waiting on the bulk wrapper (which doesn't hold the lock).
      const [bulkResult, singleResult] = await Promise.all([
        fleshOutEntities(dmId, campaignId, [entityId, second.id]),
        fleshOutEntity(dmId, campaignId, third.id),
      ]);

      expect(bulkResult.proposedCount).toBe(2);
      expect(singleResult.changeSetId).toBeTruthy();
    },
    10_000,
  );
});

describe("fleshOutEntities (bulk)", () => {
  it("files one PENDING proposal per selected entity and reports each as proposed", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const second = await makeStub(dmId, campaignId, "Donut");
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "Richer.", description: "Lore.", tags: ["ally"] }),
    );

    const result = await fleshOutEntities(dmId, campaignId, [entityId, second.id]);

    expect(result).toMatchObject({ model: "claude-opus-4-8", proposedCount: 2, skippedCount: 0 });
    expect(result.outcomes.every((o) => o.status === "proposed")).toBe(true);
    // One PENDING change set per entity — independent review (invariant #1).
    const sets = await prisma.changeSet.findMany({ where: { campaignId, source: "AI" } });
    expect(sets).toHaveLength(2);
    expect(sets.every((s) => s.status === "PENDING")).toBe(true);
    expect(result.outcomes.map((o) => o.changeSetId).sort()).toEqual(
      sets.map((s) => s.id).sort(),
    );
  });

  it("skips a locked or no-change entity without blocking the others", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const locked = await makeStub(dmId, campaignId, "Statue");
    await setEntityLock(dmId, campaignId, locked.id, { locked: true });
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "Richer.", description: "Lore.", tags: ["ally"] }),
    );

    const result = await fleshOutEntities(dmId, campaignId, [locked.id, entityId]);

    expect(result.proposedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    const lockedOutcome = result.outcomes.find((o) => o.entityId === locked.id);
    expect(lockedOutcome?.status).toBe("skipped");
    expect(lockedOutcome?.detail).toMatch(/locked/i);
    expect(result.outcomes.find((o) => o.entityId === entityId)?.status).toBe("proposed");
  });

  it("labels an id that no longer resolves as not found", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "x", description: "y", tags: [] }),
    );

    const result = await fleshOutEntities(dmId, campaignId, ["missing-id"]);

    expect(result.proposedCount).toBe(0);
    expect(result.outcomes[0]).toMatchObject({ status: "skipped", detail: "Entity not found." });
  });

  it("stops spending once the cap is reached and skips the remaining entities", async () => {
    const { dmId, campaignId, entityId } = await seed();
    const second = await makeStub(dmId, campaignId, "Donut");
    // Cap already reached, so no provider call happens at all.
    await setCampaignSpendCap(dmId, campaignId, 50);
    await recordAiUsage({
      campaignId,
      userId: dmId,
      providerId: "anthropic",
      model: "claude-opus-4-8",
      generatorId: "flesh-entity",
      usage: SAMPLE_USAGE,
    });
    const provider = fakeProvider({ summary: "x", description: "y", tags: ["z"] });
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await fleshOutEntities(dmId, campaignId, [entityId, second.id]);

    expect(result.proposedCount).toBe(0);
    expect(result.skippedCount).toBe(2);
    expect(result.outcomes[0].detail).toMatch(/spend cap/i);
    expect(result.outcomes[1].detail).toMatch(/spend cap/i);
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("rejects an empty selection, an oversized batch, and a missing provider", async () => {
    const { dmId, campaignId, entityId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "x", description: "y", tags: [] }),
    );
    await expect(fleshOutEntities(dmId, campaignId, ["  ", ""])).rejects.toThrow(/at least one/i);
    await expect(
      fleshOutEntities(dmId, campaignId, Array.from({ length: 21 }, (_, i) => `id-${i}`)),
    ).rejects.toThrow(/at most/i);

    resolveCampaignProvider.mockResolvedValue(null);
    await expect(fleshOutEntities(dmId, campaignId, [entityId])).rejects.toThrow(/No AI provider/i);
  });

  it("denies a player", async () => {
    const { playerId, campaignId, entityId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "x", description: "y", tags: [] }),
    );
    await expect(fleshOutEntities(playerId, campaignId, [entityId])).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });
});

function fakeContentProvider(
  data: { name: string; summary: string; description: string; tags?: string[] },
  over: { id?: string; model?: string } = {},
) {
  const model = over.model ?? "claude-opus-4-8";
  return {
    id: over.id ?? "anthropic",
    model,
    generate: vi.fn(),
    generateStructured: vi.fn().mockResolvedValue({ data, usage: SAMPLE_USAGE, model }),
  };
}

describe("generateDungeonContent", () => {
  async function authorSystemPersona(dmId: string, campaignId: string) {
    const systemAi = await createGenericEntity(dmId, campaignId, {
      type: "SYSTEM_AI",
      name: "The System",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [],
    });
    await createPersonaSnapshot(dmId, campaignId, systemAi.id, {
      label: "Petty God",
      dials: { theatricality: 90 },
      values: [],
      overtAgendas: ["Make it a show."],
      secretAgendas: ["Undermine Borant."],
      resources: [],
      knowledgeScope: "OMNISCIENT",
      voiceGuide: "Grandiose and petty.",
      constraints: "",
      isActive: true,
    });
  }

  const sampleBoss = {
    name: "The Maitre D'",
    summary: "A boss who seats you at the wrong table.",
    description: "## The Maitre D'\nHe collects betrayals like silverware.",
    tags: ["boss", "betrayal"],
  };

  it("files a single PENDING CREATE_ENTITY proposal in the active persona's voice, with attribution", async () => {
    const { dmId, campaignId } = await seed();
    await authorSystemPersona(dmId, campaignId);
    const provider = fakeContentProvider(sampleBoss);
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await generateDungeonContent(dmId, campaignId, {
      type: "BOSS",
      brief: "A floor-3 boss themed around betrayal.",
    });

    expect(result).toMatchObject({
      providerId: "anthropic",
      model: "claude-opus-4-8",
      entityName: "The Maitre D'",
    });

    // The prompt adopts the active persona's voice and carries the brief; the
    // secret agenda informs tone on the DM side but never reaches player output.
    const req = provider.generateStructured.mock.calls[0][0];
    const systemText = (req.system as Array<{ text: string }>).map((b) => b.text).join("\n");
    expect(systemText).toContain("System AI persona: Petty God");
    expect(systemText).toMatch(/System AI's current voice/i);
    expect(systemText).toContain("Undermine Borant.");
    expect(req.messages[0].content).toContain("A floor-3 boss themed around betrayal.");

    // Nothing becomes canon (invariant #1): the boss is not a live canon entity.
    expect(
      await prisma.entity.count({ where: { campaignId, name: "The Maitre D'", status: "CANON" } }),
    ).toBe(0);

    const changeSet = await prisma.changeSet.findUniqueOrThrow({
      where: { id: result.changeSetId },
      include: { operations: true },
    });
    expect(changeSet).toMatchObject({
      status: "PENDING",
      source: ChangeSource.AI,
      providerId: "anthropic",
      model: "claude-opus-4-8",
      promptId: "dungeon-content",
      promptVersion: "1",
      personaPromptVersion: 1,
    });
    expect(changeSet.personaSnapshotId).toBeTruthy();
    expect(changeSet.operations).toHaveLength(1);
    expect(changeSet.operations[0].op).toBe("CREATE_ENTITY");
    const patch = changeSet.operations[0].patch as Record<string, { to: unknown }>;
    expect(patch.type.to).toBe("BOSS");
    expect(patch.name.to).toBe("The Maitre D'");
    expect(patch.description.to).toBe(sampleBoss.description);
    expect(patch.isStub.to).toBe(false);
    expect(patch.visibility.to).toBe("DM_ONLY");
  });

  it("creates the entity as AI-sourced canon with description + persona provenance when approved", async () => {
    const { dmId, campaignId } = await seed();
    await authorSystemPersona(dmId, campaignId);
    resolveCampaignProvider.mockResolvedValue(fakeContentProvider(sampleBoss));

    const { changeSetId } = await generateDungeonContent(dmId, campaignId, {
      type: "BOSS",
      brief: "A floor-3 boss themed around betrayal.",
    });
    const changeSet = await prisma.changeSet.findUniqueOrThrow({ where: { id: changeSetId } });

    await prisma.changeOperation.updateMany({
      where: { changeSetId, decision: "PENDING" },
      data: { decision: "ACCEPTED" },
    });
    await approveChangeSet(dmId, campaignId, changeSetId);

    const created = await prisma.entity.findFirstOrThrow({
      where: { campaignId, name: "The Maitre D'" },
    });
    expect(created.type).toBe("BOSS");
    expect(created.source).toBe("AI");
    expect(created.isStub).toBe(false);
    expect(created.description).toBe(sampleBoss.description);

    const provenance = await prisma.provenance.findMany({
      where: { entityId: created.id, source: "AI" },
    });
    expect(provenance.length).toBeGreaterThan(0);
    expect(provenance.map((p) => p.promptId)).toContain("dungeon-content");
    // Approval copies the driving persona snapshot onto each field's provenance.
    expect(provenance.every((p) => p.personaSnapshotId === changeSet.personaSnapshotId)).toBe(true);
  });

  it("generates un-flavored content with no persona attribution when no System AI persona is active", async () => {
    const { dmId, campaignId } = await seed();
    const provider = fakeContentProvider({
      name: "Mimic Chest",
      summary: "It bites.",
      description: "A loot chest that is, regrettably, hungry.",
      tags: ["loot"],
    });
    resolveCampaignProvider.mockResolvedValue(provider);

    const result = await generateDungeonContent(dmId, campaignId, {
      type: "ITEM",
      brief: "A treasure chest that is secretly a monster.",
    });

    const systemText = (
      provider.generateStructured.mock.calls[0][0].system as Array<{ text: string }>
    )
      .map((b) => b.text)
      .join("\n");
    expect(systemText).not.toContain("System AI persona");
    expect(systemText).not.toMatch(/current voice/i);

    const changeSet = await prisma.changeSet.findUniqueOrThrow({ where: { id: result.changeSetId } });
    expect(changeSet.status).toBe("PENDING");
    expect(changeSet.personaSnapshotId).toBeNull();
    expect(changeSet.personaPromptVersion).toBeNull();
  });

  it("passes the brief and existing campaign tags into the prompt", async () => {
    const { dmId, campaignId } = await seed();
    const provider = fakeContentProvider({
      name: "Banner of the Betrayed",
      summary: "A title.",
      description: "Held by those who turned on their party.",
    });
    resolveCampaignProvider.mockResolvedValue(provider);

    await generateDungeonContent(dmId, campaignId, {
      type: "TITLE",
      brief: "A title for a crawler who betrayed their party.",
    });

    const user = provider.generateStructured.mock.calls[0][0].messages[0].content;
    expect(user).toContain("A title for a crawler who betrayed their party.");
    // The seeded "Mordecai" carries tag "existing", offered for reuse.
    expect(user).toContain("Existing campaign tags to prefer: existing");
  });

  it("records usage but files no proposal when the model returns a blank name", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(
      fakeContentProvider({ name: "   ", summary: "s", description: "d", tags: [] }),
    );

    await expect(
      generateDungeonContent(dmId, campaignId, { type: "MOB_TYPE", brief: "A mob." }),
    ).rejects.toThrow(/usable/i);

    // Paid call still counts toward spend, but nothing was filed.
    expect(await prisma.aiUsage.count({ where: { campaignId, generatorId: "dungeon-content" } })).toBe(1);
    expect(await prisma.changeSet.count({ where: { campaignId, source: "AI" } })).toBe(0);
  });

  it("errors when no provider is configured", async () => {
    const { dmId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(null);
    await expect(
      generateDungeonContent(dmId, campaignId, { type: "BOSS", brief: "A boss." }),
    ).rejects.toThrow(/No AI provider/i);
  });

  it("surfaces a ProviderError as a safe ServiceError without filing a proposal", async () => {
    const { dmId, campaignId } = await seed();
    const provider = fakeContentProvider(sampleBoss);
    provider.generateStructured.mockRejectedValue(new ProviderError("schema mismatch"));
    resolveCampaignProvider.mockResolvedValue(provider);

    const err = await generateDungeonContent(dmId, campaignId, {
      type: "BOSS",
      brief: "A boss.",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.message).toMatch(/schema mismatch/);
    expect(await prisma.changeSet.count({ where: { campaignId, source: "AI" } })).toBe(0);
  });

  it("denies a player without calling the provider", async () => {
    const { playerId, campaignId } = await seed();
    resolveCampaignProvider.mockResolvedValue(fakeContentProvider(sampleBoss));
    await expect(
      generateDungeonContent(playerId, campaignId, { type: "BOSS", brief: "A boss." }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(resolveCampaignProvider).not.toHaveBeenCalled();
  });
});
