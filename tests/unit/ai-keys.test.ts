import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import { createCampaign } from "@/server/services/campaigns";
import {
  deleteAiKey,
  getAiKeyConfig,
  getDecryptedAiKey,
  listAiKeys,
  setAiKey,
} from "@/server/services/ai-keys";

function makeUser(email: string) {
  return prisma.user.create({ data: { email } });
}

beforeEach(async () => {
  await prisma.aiKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("setAiKey", () => {
  it("encrypts the key at rest, stores a last-four hint, and writes a SET_AI_KEY audit row", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    const view = await setAiKey(dm.id, campaign.id, {
      providerId: "anthropic",
      apiKey: "sk-ant-secret-key-9999",
    });
    expect(view.providerId).toBe("anthropic");
    expect(view.label).toBe("Anthropic (Claude)");
    expect(view.lastFour).toBe("9999");

    const row = await prisma.aiKey.findFirstOrThrow();
    // Never stored in the clear.
    expect(row.ciphertext).not.toContain("sk-ant-secret-key-9999");
    expect(row.lastFour).toBe("9999");
    expect(row.createdById).toBe(dm.id);

    const audit = await prisma.auditLog.findFirstOrThrow();
    expect(audit.action).toBe("SET_AI_KEY");
    expect(audit.targetType).toBe("AI_KEY");
    expect(audit.targetId).toBe("anthropic");
    // The audit detail must never contain the key — only the hint.
    expect(JSON.stringify(audit.detail)).not.toContain("sk-ant-secret-key-9999");
    expect((audit.detail as { lastFour?: string }).lastFour).toBe("9999");
    expect((audit.detail as { replaced?: boolean }).replaced).toBe(false);
  });

  it("replaces an existing key in place (one row per provider) and records replaced=true", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    await setAiKey(dm.id, campaign.id, { providerId: "anthropic", apiKey: "sk-ant-old-key-1111" });
    await setAiKey(dm.id, campaign.id, { providerId: "anthropic", apiKey: "sk-ant-new-key-2222" });

    const rows = await prisma.aiKey.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].lastFour).toBe("2222");
    expect(await getDecryptedAiKey(campaign.id, "anthropic")).toBe("sk-ant-new-key-2222");

    const replaceAudit = await prisma.auditLog.findFirst({
      where: { action: "SET_AI_KEY" },
      orderBy: { createdAt: "desc" },
    });
    expect((replaceAudit!.detail as { replaced?: boolean }).replaced).toBe(true);
  });

  it("rejects an unknown provider and an obviously invalid key", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    await expect(
      setAiKey(dm.id, campaign.id, { providerId: "wizard-ai", apiKey: "sk-valid-enough" }),
    ).rejects.toBeInstanceOf(ServiceError);
    await expect(
      setAiKey(dm.id, campaign.id, { providerId: "openai", apiKey: "short" }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("denies a player and a non-member", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const stranger = await makeUser("stranger@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    await expect(
      setAiKey(player.id, campaign.id, { providerId: "openai", apiKey: "sk-player-key" }),
    ).rejects.toBeInstanceOf(ServiceError);
    await expect(
      setAiKey(stranger.id, campaign.id, { providerId: "openai", apiKey: "sk-stranger-key" }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(await prisma.aiKey.count()).toBe(0);
  });
});

describe("listAiKeys", () => {
  it("returns safe views without ciphertext, and [] for a player", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });
    await setAiKey(dm.id, campaign.id, { providerId: "openai", apiKey: "sk-openai-key-3333" });

    const views = await listAiKeys(dm.id, campaign.id);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ providerId: "openai", label: "OpenAI", lastFour: "3333" });
    expect(views[0]).not.toHaveProperty("ciphertext");

    expect(await listAiKeys(player.id, campaign.id)).toEqual([]);
  });
});

describe("deleteAiKey", () => {
  it("removes the key and writes a DELETE_AI_KEY audit row", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    await setAiKey(dm.id, campaign.id, { providerId: "anthropic", apiKey: "sk-ant-delete-4444" });

    await deleteAiKey(dm.id, campaign.id, "anthropic");
    expect(await prisma.aiKey.count()).toBe(0);

    const audit = await prisma.auditLog.findFirst({ where: { action: "DELETE_AI_KEY" } });
    expect(audit!.targetId).toBe("anthropic");
    expect((audit!.detail as { lastFour?: string }).lastFour).toBe("4444");
  });

  it("throws when no key is configured, and denies a player", async () => {
    const dm = await makeUser("dm@test.com");
    const player = await makeUser("player@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    await prisma.membership.create({
      data: { userId: player.id, campaignId: campaign.id, role: Role.PLAYER },
    });

    await expect(deleteAiKey(dm.id, campaign.id, "anthropic")).rejects.toBeInstanceOf(ServiceError);
    await expect(deleteAiKey(player.id, campaign.id, "anthropic")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});

describe("getDecryptedAiKey", () => {
  it("decrypts a stored key and returns null when none is configured", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    await setAiKey(dm.id, campaign.id, { providerId: "anthropic", apiKey: "sk-ant-roundtrip-5555" });

    expect(await getDecryptedAiKey(campaign.id, "anthropic")).toBe("sk-ant-roundtrip-5555");
    expect(await getDecryptedAiKey(campaign.id, "openai")).toBeNull();
  });
});

describe("OpenAI-compatible providers", () => {
  // These exercise the self-hosted/local endpoint feature (Ollama on localhost),
  // which the SSRF egress policy gates behind an explicit opt-in. Enable it so the
  // local-endpoint paths are reachable; the default-deny behaviour is covered
  // separately below.
  beforeEach(() => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a private/loopback endpoint by default (SSRF egress policy)", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    // Loopback, link-local cloud-metadata, and private LAN literals are all blocked.
    for (const baseUrl of [
      "http://127.0.0.1:11434/v1",
      "http://169.254.169.254/latest/meta-data",
      "http://192.168.1.10:8080/v1",
    ]) {
      await expect(
        setAiKey(dm.id, campaign.id, {
          providerId: "openai-compatible",
          apiKey: "",
          baseUrl,
          model: "llama3.1",
        }),
      ).rejects.toBeInstanceOf(ServiceError);
    }
    expect(await prisma.aiKey.count()).toBe(0);
  });

  it("stores a base URL + model, allows a blank key, and projects them in the safe view", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    const view = await setAiKey(dm.id, campaign.id, {
      providerId: "openai-compatible",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1/",
      model: "llama3.1",
    });
    // Trailing slash normalized off; non-secret config is safe to return.
    expect(view.baseUrl).toBe("http://localhost:11434/v1");
    expect(view.model).toBe("llama3.1");
    expect(view.lastFour).toBe("");

    const config = await getAiKeyConfig(campaign.id, "openai-compatible");
    expect(config).toEqual({
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      embeddingModel: null,
    });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "SET_AI_KEY" } });
    expect((audit.detail as { baseUrl?: string }).baseUrl).toBe("http://localhost:11434/v1");
    expect((audit.detail as { model?: string }).model).toBe("llama3.1");

    const views = await listAiKeys(dm.id, campaign.id);
    expect(views[0]).toMatchObject({ baseUrl: "http://localhost:11434/v1", model: "llama3.1" });
  });

  it("stores a bring-your-own embedding model and surfaces it in the safe views", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    const view = await setAiKey(dm.id, campaign.id, {
      providerId: "openai-compatible",
      apiKey: "",
      baseUrl: "https://api.mistral.ai/v1",
      model: "mistral-large-latest",
      embeddingModel: "codestral-embed",
    });
    expect(view.embeddingModel).toBe("codestral-embed");

    // Available to the embedder resolver (internal config) and the list view.
    const config = await getAiKeyConfig(campaign.id, "openai-compatible");
    expect(config?.embeddingModel).toBe("codestral-embed");
    const views = await listAiKeys(dm.id, campaign.id);
    expect(views[0]).toMatchObject({ embeddingModel: "codestral-embed" });

    // The non-secret audit detail records it; clearing it (blank) removes it.
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "SET_AI_KEY" } });
    expect((audit.detail as { embeddingModel?: string | null }).embeddingModel).toBe("codestral-embed");

    const cleared = await setAiKey(dm.id, campaign.id, {
      providerId: "openai-compatible",
      apiKey: "",
      baseUrl: "https://api.mistral.ai/v1",
      model: "mistral-large-latest",
      embeddingModel: "",
    });
    expect(cleared.embeddingModel).toBeNull();
  });

  it("stores DM-supplied per-token price overrides and projects them in the safe view", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    const view = await setAiKey(dm.id, campaign.id, {
      providerId: "openai-compatible",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      inputPerMTokUsd: 0.5,
      outputPerMTokUsd: 1.5,
    });
    expect(view.inputPerMTokUsd).toBe(0.5);
    expect(view.outputPerMTokUsd).toBe(1.5);

    // Persisted, and surfaced through the list view (non-secret config).
    const views = await listAiKeys(dm.id, campaign.id);
    expect(views[0]).toMatchObject({ inputPerMTokUsd: 0.5, outputPerMTokUsd: 1.5 });

    // Clearing the rates (null) on a later save removes them.
    const cleared = await setAiKey(dm.id, campaign.id, {
      providerId: "openai-compatible",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
      inputPerMTokUsd: null,
      outputPerMTokUsd: null,
    });
    expect(cleared.inputPerMTokUsd).toBeNull();
    expect(cleared.outputPerMTokUsd).toBeNull();
  });

  it("requires an endpoint URL and a model, and rejects a junk URL", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    // Missing base URL.
    await expect(
      setAiKey(dm.id, campaign.id, { providerId: "openai-compatible", apiKey: "", model: "llama3.1" }),
    ).rejects.toBeInstanceOf(ServiceError);
    // Missing model.
    await expect(
      setAiKey(dm.id, campaign.id, {
        providerId: "openai-compatible",
        apiKey: "",
        baseUrl: "http://localhost:11434/v1",
      }),
    ).rejects.toBeInstanceOf(ServiceError);
    // Non-http(s) endpoint.
    await expect(
      setAiKey(dm.id, campaign.id, {
        providerId: "openai-compatible",
        apiKey: "",
        baseUrl: "not a url",
        model: "llama3.1",
      }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(await prisma.aiKey.count()).toBe(0);
  });

  it("preserves an existing key when an edit submits a blank key (key-optional provider)", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });

    // Configure a compatible endpoint WITH a real proxy key.
    await setAiKey(dm.id, campaign.id, {
      providerId: "openai-compatible",
      apiKey: "proxy-secret-7777",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1",
    });
    expect((await getAiKeyConfig(campaign.id, "openai-compatible"))?.apiKey).toBe("proxy-secret-7777");

    // Re-save with only the model changed and a blank key (password fields render
    // blank on edit) — the stored key must survive.
    const view = await setAiKey(dm.id, campaign.id, {
      providerId: "openai-compatible",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.2",
    });
    expect(view.model).toBe("llama3.2");
    expect(view.lastFour).toBe("7777");
    const config = await getAiKeyConfig(campaign.id, "openai-compatible");
    expect(config?.apiKey).toBe("proxy-secret-7777");
    expect(config?.model).toBe("llama3.2");
  });

  it("getAiKeyConfig returns null when nothing is configured", async () => {
    const dm = await makeUser("dm@test.com");
    const campaign = await createCampaign(dm.id, { name: "Crawl" });
    expect(await getAiKeyConfig(campaign.id, "anthropic")).toBeNull();
  });
});
