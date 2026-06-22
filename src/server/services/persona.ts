import {
  CanonStatus,
  ChangeSource,
  EntityType,
  OpKind,
  Role,
} from "@/generated/prisma/client";
import {
  compilePersonaPrompt,
  normalizePersonaAgendas,
  normalizePersonaDials,
  normalizePersonaResources,
  normalizePersonaValues,
  type PersonaKnowledgeScope,
} from "@/lib/persona";
import type { PersonaSnapshotInput } from "@/lib/validation";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/server/db";
import {
  applyAutoApprovedPersonaSnapshotChangeSet,
  type ReviewPatch,
} from "@/server/services/review";

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

// Narrow a stored JSON value to a plain object record (dropping arrays, null,
// and scalars) for the compiler's optional dials/resources inputs.
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
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
        dials: asRecord(snapshot.dials),
        values: snapshot.values,
        agendas: snapshot.agendas,
        resources: asRecord(snapshot.resources),
        knowledgeScope: snapshot.knowledgeScope,
        voiceGuide: snapshot.voiceGuide,
        constraints: snapshot.constraints,
      }),
    promptLocked: snapshot.promptLocked,
    version: snapshot.version,
  };
}

// ───────────── Persona Studio (M6 slice 2 — DM-only authoring surface) ─────────

export type PersonaStudioEntity = {
  id: string;
  name: string;
};

export type PersonaSnapshotView = {
  id: string;
  label: string | null;
  dials: Record<string, number>;
  values: string[];
  overtAgendas: string[];
  secretAgendas: string[];
  resources: { key: string; value: string }[];
  knowledgeScope: PersonaKnowledgeScope;
  voiceGuide: string | null;
  constraints: string | null;
  compiledPrompt: string | null;
  isActive: boolean;
  locked: boolean;
  promptLocked: boolean;
  version: number;
  source: ChangeSource;
  createdAt: Date;
  updatedAt: Date;
  /** The change set that last authored this snapshot — deep-links the Review Queue. */
  originChangeSetId: string | null;
};

export type PersonaStudioData = {
  entities: PersonaStudioEntity[];
  selectedEntityId: string | null;
  snapshots: PersonaSnapshotView[];
  activeSnapshotId: string | null;
};

function knowledgeScope(value: string): PersonaKnowledgeScope {
  return value === "IN_CHARACTER" ? "IN_CHARACTER" : "OMNISCIENT";
}

// Load everything the Persona Studio needs for one campaign: the SYSTEM_AI
// entities a persona can attach to, and the snapshot timeline for the selected
// one (newest first). DM-only — snapshots carry secret agendas and dial values
// that must never reach players (invariant #5).
export async function getPersonaStudio(
  userId: string,
  campaignId: string,
  selectedEntityId?: string | null,
): Promise<PersonaStudioData> {
  await assertCampaignDm(userId, campaignId);

  const entities = await prisma.entity.findMany({
    where: { campaignId, type: EntityType.SYSTEM_AI, status: CanonStatus.CANON },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const selected =
    (selectedEntityId && entities.find((e) => e.id === selectedEntityId)?.id) ||
    entities[0]?.id ||
    null;

  if (!selected) {
    return { entities, selectedEntityId: null, snapshots: [], activeSnapshotId: null };
  }

  const rows = await prisma.personaSnapshot.findMany({
    where: {
      campaignId,
      entityId: selected,
      status: { not: CanonStatus.ARCHIVED },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      label: true,
      dials: true,
      values: true,
      agendas: true,
      resources: true,
      knowledgeScope: true,
      voiceGuide: true,
      constraints: true,
      compiledPrompt: true,
      isActive: true,
      locked: true,
      promptLocked: true,
      version: true,
      source: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // The change set that last authored each snapshot (its own provenance rows have
  // no entityId — generation-driven rows do), so the studio can deep-link the
  // Review Queue history for "where did this snapshot come from?".
  const snapshotIds = rows.map((row) => row.id);
  const originBySnapshot = new Map<string, string>();
  if (snapshotIds.length > 0) {
    const provenance = await prisma.provenance.findMany({
      where: { campaignId, personaSnapshotId: { in: snapshotIds }, entityId: null },
      orderBy: { createdAt: "desc" },
      select: { personaSnapshotId: true, changeSetId: true },
    });
    for (const row of provenance) {
      if (row.personaSnapshotId && !originBySnapshot.has(row.personaSnapshotId)) {
        originBySnapshot.set(row.personaSnapshotId, row.changeSetId);
      }
    }
  }

  const snapshots: PersonaSnapshotView[] = rows.map((row) => {
    const agendas = normalizePersonaAgendas(row.agendas);
    return {
      id: row.id,
      label: row.label,
      dials: normalizePersonaDials(row.dials),
      values: normalizePersonaValues(row.values),
      overtAgendas: agendas.filter((a) => !a.secret).map((a) => a.text),
      secretAgendas: agendas.filter((a) => a.secret).map((a) => a.text),
      resources: normalizePersonaResources(row.resources),
      knowledgeScope: knowledgeScope(row.knowledgeScope),
      voiceGuide: row.voiceGuide,
      constraints: row.constraints,
      compiledPrompt: row.compiledPrompt,
      isActive: row.isActive,
      locked: row.locked,
      promptLocked: row.promptLocked,
      version: row.version,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      originChangeSetId: originBySnapshot.get(row.id) ?? null,
    };
  });

  return {
    entities,
    selectedEntityId: selected,
    snapshots,
    activeSnapshotId: snapshots.find((s) => s.isActive)?.id ?? null,
  };
}

// Turn a validated studio input into the review-pipeline patch shape (the dials,
// agendas, and resources collapse back into their stored JSON forms). Shared by
// create + update so both file the same canonical patch.
function personaInputToPatch(input: PersonaSnapshotInput): ReviewPatch {
  const dials: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.dials)) {
    if (typeof value === "number") dials[key] = value;
  }
  const agendas = [
    ...input.overtAgendas.map((text) => ({ text, secret: false })),
    ...input.secretAgendas.map((text) => ({ text, secret: true })),
  ];
  const resources: Record<string, string> = {};
  for (const { key, value } of input.resources) resources[key] = value;

  return {
    label: { to: input.label?.trim() ? input.label.trim() : null },
    dials: { to: dials },
    values: { to: input.values },
    agendas: { to: agendas },
    resources: { to: resources },
    knowledgeScope: { to: input.knowledgeScope },
    voiceGuide: { to: input.voiceGuide?.trim() ? input.voiceGuide.trim() : null },
    constraints: { to: input.constraints?.trim() ? input.constraints.trim() : null },
    isActive: { to: input.isActive },
  };
}

async function loadStudioSnapshot(campaignId: string, snapshotId: string) {
  const snapshot = await prisma.personaSnapshot.findFirst({
    where: { id: snapshotId, campaignId, status: { not: CanonStatus.ARCHIVED } },
    select: { id: true, label: true, entity: { select: { name: true } } },
  });
  if (!snapshot) throw new ServiceError("Persona snapshot not found.");
  return snapshot;
}

function personaTitleSuffix(label: string | null | undefined) {
  return label?.trim() ? `: ${label.trim()}` : "";
}

// Author a new persona snapshot for a SYSTEM_AI entity. DM authoring is
// auto-approved (like every other direct DM canon edit — invariant #1 models it
// as an auto-approved proposal with full provenance). Returns the created
// snapshot + the change set so the studio can deep-link the Review Queue.
export async function createPersonaSnapshot(
  userId: string,
  campaignId: string,
  entityId: string,
  input: PersonaSnapshotInput,
): Promise<{ changeSetId: string; snapshotId: string }> {
  await assertCampaignDm(userId, campaignId);
  const entity = await prisma.entity.findFirst({
    where: {
      id: entityId,
      campaignId,
      type: EntityType.SYSTEM_AI,
      status: CanonStatus.CANON,
    },
    select: { id: true, name: true },
  });
  if (!entity) throw new ServiceError("System AI entity not found.");

  const result = await applyAutoApprovedPersonaSnapshotChangeSet(userId, campaignId, {
    source: ChangeSource.DM,
    title: `Author ${entity.name} persona${personaTitleSuffix(input.label)}`,
    operations: [
      {
        op: OpKind.CREATE_PERSONA_SNAPSHOT,
        patch: { entityId: { to: entityId }, ...personaInputToPatch(input) },
      },
    ],
  });
  return { changeSetId: result.changeSetId, snapshotId: result.targetIds[0] };
}

export async function updatePersonaSnapshot(
  userId: string,
  campaignId: string,
  snapshotId: string,
  baseVersion: number,
  input: PersonaSnapshotInput,
): Promise<{ changeSetId: string; snapshotId: string }> {
  await assertCampaignDm(userId, campaignId);
  const snapshot = await loadStudioSnapshot(campaignId, snapshotId);

  const result = await applyAutoApprovedPersonaSnapshotChangeSet(userId, campaignId, {
    source: ChangeSource.DM,
    title: `Update ${snapshot.entity.name} persona${personaTitleSuffix(input.label)}`,
    operations: [
      {
        op: OpKind.UPDATE_PERSONA_SNAPSHOT,
        targetId: snapshotId,
        patch: { _baseVersion: { to: baseVersion }, ...personaInputToPatch(input) },
      },
    ],
  });
  return { changeSetId: result.changeSetId, snapshotId };
}

// Toggle the compiled-prompt lock (docs/05 §"Lock the prompt"). Once locked,
// recompilation/AI can't change the prompt without an explicit unlock — the
// review pipeline already enforces this for AI writes.
export async function setPersonaPromptLock(
  userId: string,
  campaignId: string,
  snapshotId: string,
  baseVersion: number,
  promptLocked: boolean,
): Promise<{ changeSetId: string }> {
  await assertCampaignDm(userId, campaignId);
  const snapshot = await loadStudioSnapshot(campaignId, snapshotId);

  const result = await applyAutoApprovedPersonaSnapshotChangeSet(userId, campaignId, {
    source: ChangeSource.DM,
    title: `${promptLocked ? "Lock" : "Unlock"} ${snapshot.entity.name} persona prompt`,
    operations: [
      {
        op: OpKind.UPDATE_PERSONA_SNAPSHOT,
        targetId: snapshotId,
        patch: {
          _baseVersion: { to: baseVersion },
          promptLocked: { to: promptLocked },
        },
      },
    ],
  });
  return { changeSetId: result.changeSetId };
}

// Make an inactive snapshot the active one (deactivating the rest — enforced in
// the apply path, which also refuses when a *locked* active snapshot is in the
// way).
export async function activatePersonaSnapshot(
  userId: string,
  campaignId: string,
  snapshotId: string,
  baseVersion: number,
): Promise<{ changeSetId: string }> {
  await assertCampaignDm(userId, campaignId);
  const snapshot = await loadStudioSnapshot(campaignId, snapshotId);

  const result = await applyAutoApprovedPersonaSnapshotChangeSet(userId, campaignId, {
    source: ChangeSource.DM,
    title: `Activate ${snapshot.entity.name} persona${personaTitleSuffix(snapshot.label)}`,
    operations: [
      {
        op: OpKind.UPDATE_PERSONA_SNAPSHOT,
        targetId: snapshotId,
        patch: { _baseVersion: { to: baseVersion }, isActive: { to: true } },
      },
    ],
  });
  return { changeSetId: result.changeSetId };
}
