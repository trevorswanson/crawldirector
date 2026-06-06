import { Role } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { aiProviderLabel, isAiProviderId } from "@/lib/ai/providers";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { prisma } from "@/server/db";

// Bring-your-own AI provider keys (M4 — docs/04-ai-integration.md). A DM stores
// their own provider API key per campaign; it is encrypted at rest and decrypted
// only at the server-side provider call (invariant #6: secrets never reach the
// client, logs, or provenance). Setting/removing a key is a deliberate, audited
// DM action (AuditLog SET_AI_KEY / DELETE_AI_KEY) — never a content change set,
// and the audit detail records only the provider + last-four hint, never the key.

async function assertCampaignDm(userId: string, campaignId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to manage this campaign's AI keys.");
  }
  return membership;
}

async function isCampaignDm(userId: string, campaignId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  return !!membership && membership.role !== Role.PLAYER;
}

// A safe, secret-free projection of a configured key for the settings UI. It
// never carries ciphertext or plaintext — only which provider is set and a
// last-four hint so the DM can recognize the key.
export type AiKeyView = {
  providerId: string;
  label: string;
  lastFour: string;
  createdAt: Date;
  updatedAt: Date;
};

// Store (or replace) the DM's key for a provider. The plaintext key is encrypted
// immediately and never persisted or logged in the clear. Returns the safe view.
export async function setAiKey(
  userId: string,
  campaignId: string,
  input: { providerId: string; apiKey: string },
): Promise<AiKeyView> {
  await assertCampaignDm(userId, campaignId);

  const providerId = input.providerId.trim();
  if (!isAiProviderId(providerId)) {
    throw new ServiceError("Unknown AI provider.");
  }
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 8) {
    throw new ServiceError("That doesn't look like a valid API key.");
  }

  const ciphertext = encryptSecret(apiKey);
  const lastFour = apiKey.slice(-4);

  const existing = await prisma.aiKey.findUnique({
    where: { campaignId_providerId: { campaignId, providerId } },
    select: { id: true },
  });

  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.aiKey.upsert({
      where: { campaignId_providerId: { campaignId, providerId } },
      create: { campaignId, providerId, ciphertext, lastFour, createdById: userId },
      update: { ciphertext, lastFour },
      select: { providerId: true, lastFour: true, createdAt: true, updatedAt: true },
    });

    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "SET_AI_KEY",
        targetType: "AI_KEY",
        targetId: providerId,
        // Never the key itself — only the non-secret hint + whether we replaced one.
        detail: { providerId, lastFour, replaced: !!existing },
      },
    });

    return row;
  });

  return {
    providerId: saved.providerId,
    label: aiProviderLabel(saved.providerId),
    lastFour: saved.lastFour,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}

// Remove the DM's key for a provider. Audited; throws if none is configured.
export async function deleteAiKey(userId: string, campaignId: string, providerId: string) {
  await assertCampaignDm(userId, campaignId);

  const key = await prisma.aiKey.findUnique({
    where: { campaignId_providerId: { campaignId, providerId } },
    select: { id: true, lastFour: true },
  });
  if (!key) throw new ServiceError("No key is configured for that provider.");

  await prisma.$transaction(async (tx) => {
    await tx.aiKey.delete({ where: { id: key.id } });
    await tx.auditLog.create({
      data: {
        campaignId,
        actorUserId: userId,
        action: "DELETE_AI_KEY",
        targetType: "AI_KEY",
        targetId: providerId,
        detail: { providerId, lastFour: key.lastFour },
      },
    });
  });

  return { providerId };
}

// List the campaign's configured keys as safe views (no ciphertext/plaintext).
// DM-facing; a player/non-member gets [] rather than an error so a shared page
// path stays readable.
export async function listAiKeys(userId: string, campaignId: string): Promise<AiKeyView[]> {
  if (!(await isCampaignDm(userId, campaignId))) return [];

  const keys = await prisma.aiKey.findMany({
    where: { campaignId },
    orderBy: { providerId: "asc" },
    select: { providerId: true, lastFour: true, createdAt: true, updatedAt: true },
  });

  return keys.map((k) => ({
    providerId: k.providerId,
    label: aiProviderLabel(k.providerId),
    lastFour: k.lastFour,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }));
}

// INTERNAL — server-only. Resolve and decrypt a campaign's provider key for an
// actual provider call (M4 generators, later slices). The plaintext returned here
// must NEVER be sent to the client, logged, or written to provenance. Returns
// null when no key is configured; throws if a stored key can't be decrypted
// (e.g. AI_KEYS_SECRET rotated) so callers treat it as "no usable key".
export async function getDecryptedAiKey(
  campaignId: string,
  providerId: string,
): Promise<string | null> {
  const key = await prisma.aiKey.findUnique({
    where: { campaignId_providerId: { campaignId, providerId } },
    select: { ciphertext: true },
  });
  if (!key) return null;
  return decryptSecret(key.ciphertext);
}
