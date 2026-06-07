import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/errors";
import { ProviderError } from "@/server/ai/types";

// Mock the provider seam only — no SDK, no network. The generation
// orchestration, the generator's prompt/patch logic, and the review pipeline all
// run for real against the test database.
const { resolveCampaignProvider } = vi.hoisted(() => ({
  resolveCampaignProvider: vi.fn(),
}));

vi.mock("@/server/ai", () => ({
  resolveCampaignProvider,
  // Real-ish safe translator; generation only calls it for non-ProviderError throws.
  describeProviderError: () => "Connection failed. Check the key, endpoint, and model.",
}));

import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import { createGenericEntity } from "@/server/services/entities";
import { fleshOutEntity, inferRelationshipsForEntity } from "@/server/services/generation";
import { approveChangeSet, setEntityLock } from "@/server/services/review";

function fakeProvider(
  data: { summary: string; description: string; tags: string[] },
  over: { id?: string; model?: string } = {},
) {
  return {
    id: over.id ?? "anthropic",
    model: over.model ?? "claude-opus-4-8",
    generate: vi.fn(),
    generateStructured: vi.fn().mockResolvedValue({ data }),
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
  await prisma.provenance.deleteMany();
  await prisma.changeOperation.deleteMany();
  await prisma.changeSet.deleteMany();
  await prisma.crawler.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
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
    expect(changeSet?.promptVersion).toBe("1");
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

  it("errors when the model proposes no changes", async () => {
    const { dmId, campaignId, entityId } = await seed();
    // The entity already has these exact values (empty summary/description, tag "existing").
    resolveCampaignProvider.mockResolvedValue(
      fakeProvider({ summary: "", description: "", tags: ["existing"] }),
    );
    await expect(fleshOutEntity(dmId, campaignId, entityId)).rejects.toThrow(/any changes/i);
    expect(await prisma.changeSet.count({ where: { source: "AI" } })).toBe(0);
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
