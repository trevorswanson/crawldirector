import { CanonStatus, EntityType, Role } from "@/generated/prisma/client";
import { compilePersonaPrompt } from "@/lib/persona";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";

export type ActiveSystemPersonaPrompt = {
  snapshotId: string;
  entityId: string;
  label: string | null;
  prompt: string;
  promptLocked: boolean;
  version: number;
};

async function assertCampaignDm(userId: string, campaignId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  if (!membership || membership.role === Role.PLAYER) {
    throw new ServiceError("You do not have permission to inspect this persona.");
  }
}

export async function getActiveSystemPersonaPrompt(
  userId: string,
  campaignId: string,
): Promise<ActiveSystemPersonaPrompt | null> {
  await assertCampaignDm(userId, campaignId);

  const snapshot = await prisma.personaSnapshot.findFirst({
    where: {
      campaignId,
      isActive: true,
      status: CanonStatus.CANON,
      entity: { type: EntityType.SYSTEM_AI, status: CanonStatus.CANON },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      entityId: true,
      label: true,
      dials: true,
      values: true,
      agendas: true,
      resources: true,
      knowledgeScope: true,
      voiceGuide: true,
      constraints: true,
      compiledPrompt: true,
      promptLocked: true,
      version: true,
    },
  });
  if (!snapshot) return null;

  return {
    snapshotId: snapshot.id,
    entityId: snapshot.entityId,
    label: snapshot.label,
    prompt:
      snapshot.compiledPrompt ??
      compilePersonaPrompt({
        label: snapshot.label,
        dials:
          snapshot.dials && typeof snapshot.dials === "object" && !Array.isArray(snapshot.dials)
            ? (snapshot.dials as Record<string, unknown>)
            : undefined,
        values: snapshot.values,
        agendas: snapshot.agendas,
        resources:
          snapshot.resources &&
          typeof snapshot.resources === "object" &&
          !Array.isArray(snapshot.resources)
            ? (snapshot.resources as Record<string, unknown>)
            : undefined,
        knowledgeScope: snapshot.knowledgeScope,
        voiceGuide: snapshot.voiceGuide,
        constraints: snapshot.constraints,
      }),
    promptLocked: snapshot.promptLocked,
    version: snapshot.version,
  };
}
