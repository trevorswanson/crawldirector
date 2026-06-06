"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { signOut } from "@/server/auth";
import { requireUser } from "@/server/auth/session";
import { ServiceError } from "@/lib/errors";
import { createCampaign, setCampaignCurrentFloor } from "@/server/services/campaigns";
import {
  createCampaignSchema,
  createCrawlerSchema,
  createEventSchema,
  createGenericEntitySchema,
  createRelationshipSchema,
  changeOperationDecisionSchema,
  eventEffectSchema,
  eventParticipantRoleValues,
  grantKnowledgeSchema,
  lockFieldSchema,
  reviewEditValueKindSchema,
  updateEntitySchema,
  updateEventSchema,
  updateRelationshipSchema,
} from "@/lib/validation";
import {
  archiveRelationship,
  createRelationship,
  restoreRelationship,
  setRelationshipLock,
  updateRelationship,
} from "@/server/services/relationships";
import {
  applyEventEffects,
  archiveEvent,
  archiveEventCausality,
  createEvent,
  linkEventCause,
  orderEventsFromCausality,
  reorderEvent,
  restoreEvent,
  restoreEventCausality,
  setEventLock,
  updateEvent,
} from "@/server/services/events";
import {
  archiveEntity,
  createCrawler,
  createGenericEntity,
  getEntityForUser,
  restoreEntity,
  updateEntity,
} from "@/server/services/entities";
import {
  grantEntityKnowledge,
  revokeKnowledge,
} from "@/server/services/knowledge";
import { fleshOutEntity } from "@/server/services/generation";
import {
  approveChangeSet,
  approveChangeSetRun,
  rejectChangeSet,
  rejectChangeSetRun,
  reopenChangeSet,
  setChangeOperationDecision,
  setChangeOperationFieldDecision,
  setEntityLock,
  supersedeChangeSet,
  type ReviewPatch,
} from "@/server/services/review";

export type CampaignActionState = { error?: string } | undefined;
export type EntityActionState =
  | { error?: string; success?: string; values?: Record<string, unknown>; timestamp?: number }
  | undefined;

export async function createCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const user = await requireUser();

  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
    summary: formData.get("summary"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let campaignId: string;
  try {
    const campaign = await createCampaign(user.id, parsed.data);
    campaignId = campaign.id;
  } catch (err) {
    console.error("Campaign creation failed:", err);
    return { error: "Could not create the campaign. Please try again." };
  }

  redirect(`/campaigns/${campaignId}`);
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}

export async function createGenericEntityAction(
  campaignId: string,
  _prev: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  const user = await requireUser();
  const parsed = createGenericEntitySchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    summary: formData.get("summary"),
    description: formData.get("description"),
    visibility: formData.get("visibility") || "DM_ONLY",
    tags: formData.get("tags"),
    itemTypeId: formData.get("itemTypeId"),
    divine: formData.get("divine"),
    unique: formData.get("unique"),
    fleeting: formData.get("fleeting"),
    aiDescription: formData.get("aiDescription"),
    floorNumber: formData.get("floorNumber"),
    theme: formData.get("theme"),
    startDay: formData.get("startDay"),
    collapseDay: formData.get("collapseDay"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let entityId: string;
  try {
    const entity = await createGenericEntity(user.id, campaignId, parsed.data);
    entityId = entity.id;
  } catch (error) {
    console.error("Create generic entity action failed:", error);
    return { error: "Could not create the entity. Please try again." };
  }

  redirect(`/campaigns/${campaignId}/entities/${entityId}`);
}

export async function createCrawlerAction(
  campaignId: string,
  _prev: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  const user = await requireUser();
  const parsed = createCrawlerSchema.safeParse({
    name: formData.get("name"),
    realName: formData.get("realName"),
    crawlerNo: formData.get("crawlerNo"),
    summary: formData.get("summary"),
    description: formData.get("description"),
    visibility: formData.get("visibility") || "DM_ONLY",
    tags: formData.get("tags"),
    level: formData.get("level"),
    hp: formData.get("hp"),
    mp: formData.get("mp"),
    gold: formData.get("gold"),
    viewCount: formData.get("viewCount"),
    followerCount: formData.get("followerCount"),
    favoriteCount: formData.get("favoriteCount"),
    killCount: formData.get("killCount"),
    currentFloor: formData.get("currentFloor"),
    isAlive: formData.get("isAlive") || "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let entityId: string;
  try {
    const entity = await createCrawler(user.id, campaignId, parsed.data);
    entityId = entity.id;
  } catch {
    return { error: "Could not create the crawler. Please try again." };
  }

  redirect(`/campaigns/${campaignId}/entities/${entityId}`);
}

export async function quickCreateEntityAction(
  campaignId: string,
  _prev: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  const user = await requireUser();
  const type = String(formData.get("type") ?? "");
  const name = formData.get("name");
  const actionType = String(formData.get("actionType") ?? "edit");

  // A thin reference the DM fleshes out on the detail page (or with AI later).
  let entityId: string;
  try {
    if (type === "CRAWLER") {
      const parsed = createCrawlerSchema.safeParse({
        name,
        visibility: "DM_ONLY",
        tags: "",
        isStub: true,
      });
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
      }
      const entity = await createCrawler(user.id, campaignId, parsed.data);
      entityId = entity.id;
    } else {
      const parsed = createGenericEntitySchema.safeParse({
        type,
        name,
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: "",
        isStub: true,
      });
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
      }
      const entity = await createGenericEntity(user.id, campaignId, parsed.data);
      entityId = entity.id;
    }
  } catch (error) {
    console.error("Quick-create entity failed:", error);
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not create the entity. Please try again." };
  }

  if (actionType === "stay") {
    revalidatePath(`/campaigns/${campaignId}`);
    return { success: `Created stub "${name}".` };
  }

  redirect(`/campaigns/${campaignId}/entities/${entityId}`);
}

export async function updateEntityAction(
  campaignId: string,
  entityId: string,
  _prev: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  const user = await requireUser();
  const values = {
    name: formData.get("name")?.toString() ?? "",
    summary: formData.get("summary")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    visibility: formData.get("visibility")?.toString() ?? "DM_ONLY",
    tags: formData.get("tags")?.toString() ?? "",
    realName: formData.get("realName")?.toString() ?? "",
    crawlerNo: formData.get("crawlerNo")?.toString() ?? "",
    level: formData.get("level") ? Number(formData.get("level")) : undefined,
    hp: formData.get("hp") ? Number(formData.get("hp")) : undefined,
    mp: formData.get("mp") ? Number(formData.get("mp")) : undefined,
    gold: formData.get("gold") ? Number(formData.get("gold")) : undefined,
    viewCount: formData.get("viewCount")?.toString() ?? "",
    followerCount: formData.get("followerCount")?.toString() ?? "",
    favoriteCount: formData.get("favoriteCount")?.toString() ?? "",
    killCount: formData.get("killCount") ? Number(formData.get("killCount")) : undefined,
    currentFloor: formData.get("currentFloor") ? Number(formData.get("currentFloor")) : undefined,
    isAlive: formData.get("isAlive") === "false" ? false : true,
    itemTypeId: formData.get("itemTypeId")?.toString() ?? "",
    divine: formData.get("divine") === "true" || formData.get("divine") === "on",
    unique: formData.get("unique") === "true" || formData.get("unique") === "on",
    fleeting: formData.get("fleeting") === "true" || formData.get("fleeting") === "on",
    aiDescription: formData.get("aiDescription")?.toString() ?? "",
    floorNumber: formData.get("floorNumber") ? Number(formData.get("floorNumber")) : undefined,
    theme: formData.get("theme")?.toString() ?? "",
    startDay: formData.get("startDay") ? Number(formData.get("startDay")) : undefined,
    collapseDay: formData.get("collapseDay") ? Number(formData.get("collapseDay")) : undefined,
  };

  const parsed = updateEntitySchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    summary: formData.get("summary"),
    description: formData.get("description"),
    visibility: formData.get("visibility") || "DM_ONLY",
    tags: formData.get("tags"),
    realName: formData.get("realName"),
    crawlerNo: formData.get("crawlerNo"),
    level: formData.get("level"),
    hp: formData.get("hp"),
    mp: formData.get("mp"),
    gold: formData.get("gold"),
    viewCount: formData.get("viewCount"),
    followerCount: formData.get("followerCount"),
    favoriteCount: formData.get("favoriteCount"),
    killCount: formData.get("killCount"),
    currentFloor: formData.get("currentFloor"),
    isAlive: formData.get("isAlive"),
    itemTypeId: formData.get("itemTypeId"),
    divine: formData.get("divine"),
    unique: formData.get("unique"),
    fleeting: formData.get("fleeting"),
    aiDescription: formData.get("aiDescription"),
    floorNumber: formData.get("floorNumber"),
    theme: formData.get("theme"),
    startDay: formData.get("startDay"),
    collapseDay: formData.get("collapseDay"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
      values,
      timestamp: Date.now(),
    };
  }

  try {
    await updateEntity(user.id, campaignId, entityId, parsed.data);
  } catch (error) {
    // Surface expected failures (e.g. a locked field) so the DM knows to
    // unlock rather than uselessly retry; hide anything unexpected.
    if (error instanceof ServiceError) {
      return { error: error.message, values, timestamp: Date.now() };
    }
    return {
      error: "Could not update the entity. Please try again.",
      values,
      timestamp: Date.now(),
    };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
  redirect(`/campaigns/${campaignId}/entities/${entityId}`);
}

export async function toggleEntityLockAction(
  campaignId: string,
  entityId: string,
): Promise<void> {
  const user = await requireUser();
  const entity = await getEntityForUser(user.id, campaignId, entityId);
  if (!entity) return;
  await setEntityLock(user.id, campaignId, entityId, { locked: !entity.locked });
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
}

export async function toggleEntityFieldLockAction(
  campaignId: string,
  entityId: string,
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const field = lockFieldSchema.safeParse(formData.get("field"));
  if (!field.success) return;

  const entity = await getEntityForUser(user.id, campaignId, entityId);
  if (!entity) return;

  const next = new Set(entity.lockedFields);
  if (next.has(field.data)) next.delete(field.data);
  else next.add(field.data);

  await setEntityLock(user.id, campaignId, entityId, {
    lockedFields: [...next],
  });
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
}

export async function archiveEntityAction(
  campaignId: string,
  entityId: string,
): Promise<void> {
  const user = await requireUser();
  await archiveEntity(user.id, campaignId, entityId);
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}?archivedEntity=${entityId}`);
}

export async function restoreEntityAction(
  campaignId: string,
  entityId: string,
): Promise<void> {
  const user = await requireUser();
  await restoreEntity(user.id, campaignId, entityId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
  redirect(`/campaigns/${campaignId}/entities/${entityId}`);
}

export type GenerateActionState =
  | { error?: string; success?: string; changeSetId?: string; timestamp?: number }
  | undefined;

// Flesh out an entity with AI. The result lands as a PENDING proposal in the
// Review Queue (never canon — invariant #1); we return a link to it. DM/co-DM
// only (the service enforces the role). Errors are safe messages (no key/raw
// provider text — invariant #6).
export async function fleshOutEntityAction(
  campaignId: string,
  entityId: string,
  _prev: GenerateActionState,
  _formData: FormData,
): Promise<GenerateActionState> {
  const user = await requireUser();
  try {
    const result = await fleshOutEntity(user.id, campaignId, entityId);
    revalidatePath(`/campaigns/${campaignId}/review`);
    revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
    return {
      success: `Draft proposed (${result.model}). Review it in the queue.`,
      changeSetId: result.changeSetId,
      timestamp: Date.now(),
    };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, timestamp: Date.now() };
    console.error("Flesh out entity action failed:", error);
    return { error: "Generation failed. Please try again.", timestamp: Date.now() };
  }
}

export async function approveChangeSetAction(
  campaignId: string,
  changeSetId: string,
): Promise<void> {
  const user = await requireUser();
  await approveChangeSet(user.id, campaignId, changeSetId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/review`);
  redirect(`/campaigns/${campaignId}/review?done=${changeSetId}`);
}

export async function approveChangeSetRunAction(
  campaignId: string,
  runId: string,
): Promise<void> {
  const user = await requireUser();
  await approveChangeSetRun(user.id, campaignId, runId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/review`);
}

export async function setChangeOperationDecisionAction(
  campaignId: string,
  changeSetId: string,
  operationId: string,
  decision: string,
): Promise<void> {
  const user = await requireUser();
  const parsed = changeOperationDecisionSchema.safeParse(decision);
  if (!parsed.success || parsed.data === "EDITED") return;

  await setChangeOperationDecision(user.id, campaignId, changeSetId, operationId, {
    decision: parsed.data,
  });
  revalidatePath(`/campaigns/${campaignId}/review`);
}

export async function setChangeOperationFieldDecisionAction(
  campaignId: string,
  changeSetId: string,
  operationId: string,
  field: string,
  decision: string,
): Promise<void> {
  const user = await requireUser();
  const parsed = z.enum(["ACCEPTED", "PENDING", "REJECTED"]).safeParse(decision);
  const normalizedField = field.trim();
  if (!parsed.success || !normalizedField) return;

  await setChangeOperationFieldDecision(user.id, campaignId, changeSetId, operationId, {
    field: normalizedField,
    decision: parsed.data,
  });
  revalidatePath(`/campaigns/${campaignId}/review`);
}

export async function editChangeOperationFieldAction(
  campaignId: string,
  changeSetId: string,
  operationId: string,
  field: string,
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const normalizedField = field.trim();
  const kind = reviewEditValueKindSchema.safeParse(formData.get("kind"));
  const rawValue = formData.get("value");
  if (!normalizedField || !kind.success || typeof rawValue !== "string") return;
  const parsed = parseReviewEditedValue(kind.data, rawValue);
  if (parsed === undefined) return;

  await setChangeOperationFieldDecision(user.id, campaignId, changeSetId, operationId, {
    field: normalizedField,
    decision: "ACCEPTED",
    editedValue: { to: parsed as ReviewPatch[string]["to"] },
  });
  revalidatePath(`/campaigns/${campaignId}/review`);
}

// Save a structured edit to a pending APPLY_EVENT_EFFECTS operation from the
// Review Queue's effect-row editor. Reuses the shared `parseEffectRows` form
// reader + `eventEffectSchema` (coercing delta/value/alive), then stores the
// normalized effects as an EDITED decision's `editedPatch.effects.to` — the
// same shape `applyApplyEventEffects` reconciles by effect `id` on approval.
// Invalid rows (e.g. a missing delta) are a silent no-op, matching the generic
// patch editor.
export async function editEventEffectsOperationAction(
  campaignId: string,
  changeSetId: string,
  operationId: string,
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const rows = parseEffectRows(formData);
  const parsed = z.array(eventEffectSchema).max(20).safeParse(rows ?? []);
  if (
    !parsed.success ||
    parsed.data.length === 0 ||
    parsed.data.some((effect) => !effect.id)
  ) return;

  const editedPatch: ReviewPatch = {
    effects: { to: parsed.data as ReviewPatch[string]["to"] },
  };
  await setChangeOperationDecision(user.id, campaignId, changeSetId, operationId, {
    decision: "EDITED",
    editedPatch,
  });
  revalidatePath(`/campaigns/${campaignId}/review`);
}

export async function rejectChangeSetAction(
  campaignId: string,
  changeSetId: string,
): Promise<void> {
  const user = await requireUser();
  await rejectChangeSet(user.id, campaignId, changeSetId);
  revalidatePath(`/campaigns/${campaignId}/review`);
  redirect(`/campaigns/${campaignId}/review?done=${changeSetId}`);
}

export async function reopenChangeSetAction(
  campaignId: string,
  changeSetId: string,
): Promise<void> {
  const user = await requireUser();
  await reopenChangeSet(user.id, campaignId, changeSetId);
  revalidatePath(`/campaigns/${campaignId}/review`);
  redirect(`/campaigns/${campaignId}/review?selected=${changeSetId}`);
}

export async function rejectChangeSetRunAction(
  campaignId: string,
  runId: string,
): Promise<void> {
  const user = await requireUser();
  await rejectChangeSetRun(user.id, campaignId, runId);
  revalidatePath(`/campaigns/${campaignId}/review`);
}

export async function supersedeChangeSetAction(
  campaignId: string,
  changeSetId: string,
): Promise<void> {
  const user = await requireUser();
  await supersedeChangeSet(user.id, campaignId, changeSetId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/review`);
}

function parseReviewEditedValue(
  kind: "array" | "boolean" | "json" | "number" | "string",
  rawValue: string,
) {
  switch (kind) {
    case "array":
      return rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    case "boolean":
      return rawValue === "true";
    case "json":
      try {
        return JSON.parse(rawValue);
      } catch {
        return undefined;
      }
    case "number": {
      const trimmed = rawValue.trim();
      if (trimmed === "") return undefined;
      const value = Number(trimmed);
      return Number.isFinite(value) ? value : undefined;
    }
    case "string":
      return rawValue;
  }
}

export type RelationshipActionState = { error?: string } | undefined;

export async function createRelationshipAction(
  campaignId: string,
  sourceId: string,
  _prev: RelationshipActionState,
  formData: FormData,
): Promise<RelationshipActionState> {
  const user = await requireUser();
  const parsed = createRelationshipSchema.safeParse({
    type: formData.get("type"),
    targetId: formData.get("targetId"),
    disposition: formData.get("disposition"),
    sinceDay: formData.get("sinceDay"),
    untilDay: formData.get("untilDay"),
    notes: formData.get("notes"),
    secret: formData.get("secret"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await createRelationship(user.id, campaignId, sourceId, parsed.data);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not add the connection. Please try again." };
  }

  revalidatePath(`/campaigns/${campaignId}/entities/${sourceId}`);
  revalidatePath(`/campaigns/${campaignId}/entities/${parsed.data.targetId}`);
  return undefined;
}

export async function updateRelationshipAction(
  campaignId: string,
  entityId: string,
  relationshipId: string,
  _prev: RelationshipActionState,
  formData: FormData,
): Promise<RelationshipActionState> {
  const user = await requireUser();
  const parsed = updateRelationshipSchema.safeParse({
    type: formData.get("type"),
    disposition: formData.get("disposition"),
    sinceDay: formData.get("sinceDay"),
    untilDay: formData.get("untilDay"),
    notes: formData.get("notes"),
    secret: formData.get("secret"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let result: { sourceId: string; targetId: string };
  try {
    result = await updateRelationship(user.id, campaignId, relationshipId, parsed.data);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not edit the connection. Please try again." };
  }

  for (const id of new Set([entityId, result.sourceId, result.targetId])) {
    revalidatePath(`/campaigns/${campaignId}/entities/${id}`);
  }
  return undefined;
}

export async function archiveRelationshipAction(
  campaignId: string,
  entityId: string,
  relationshipId: string,
): Promise<void> {
  const user = await requireUser();
  await archiveRelationship(user.id, campaignId, relationshipId);
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
}

export async function restoreRelationshipAction(
  campaignId: string,
  entityId: string,
  relationshipId: string,
): Promise<void> {
  const user = await requireUser();
  await restoreRelationship(user.id, campaignId, relationshipId);
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
}

export async function toggleRelationshipLockAction(
  campaignId: string,
  entityId: string,
  relationshipId: string,
  locked: boolean,
): Promise<void> {
  const user = await requireUser();
  const result = await setRelationshipLock(
    user.id,
    campaignId,
    relationshipId,
    !locked,
  );
  const endpointIds = new Set([entityId, result.sourceId, result.targetId]);
  for (const endpointId of endpointIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${endpointId}`);
  }
}

export type KnowledgeActionState = { error?: string } | undefined;

// Reveal the viewed entity to an actor entity ("known to"): the viewed entity is
// the target, the picked entity is the recipient.
export async function grantEntityKnownToAction(
  campaignId: string,
  entityId: string,
  _prev: KnowledgeActionState,
  formData: FormData,
): Promise<KnowledgeActionState> {
  const user = await requireUser();
  const parsed = grantKnowledgeSchema.safeParse({
    entityId: formData.get("entityId"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    await grantEntityKnowledge(user.id, campaignId, {
      targetEntityId: entityId,
      recipientEntityId: parsed.data.entityId,
      notes: parsed.data.notes,
    });
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not record the reveal. Please try again." };
  }
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
  revalidatePath(`/campaigns/${campaignId}/entities/${parsed.data.entityId}`);
  return undefined;
}

// Record that the viewed entity knows about a canon entity ("knows about"): the
// viewed entity is the recipient, the picked entity is the target.
export async function grantEntityKnowsAboutAction(
  campaignId: string,
  entityId: string,
  _prev: KnowledgeActionState,
  formData: FormData,
): Promise<KnowledgeActionState> {
  const user = await requireUser();
  const parsed = grantKnowledgeSchema.safeParse({
    entityId: formData.get("entityId"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    await grantEntityKnowledge(user.id, campaignId, {
      targetEntityId: parsed.data.entityId,
      recipientEntityId: entityId,
      notes: parsed.data.notes,
    });
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not record the reveal. Please try again." };
  }
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
  revalidatePath(`/campaigns/${campaignId}/entities/${parsed.data.entityId}`);
  return undefined;
}

export async function revokeKnowledgeAction(
  campaignId: string,
  entityId: string,
  grantId: string,
): Promise<void> {
  const user = await requireUser();
  const result = await revokeKnowledge(user.id, campaignId, grantId);
  const endpointIds = new Set([entityId, ...result.affectedEntityIds]);
  for (const endpointId of endpointIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${endpointId}`);
  }
}

export type EventActionState = { error?: string } | undefined;
export type EventCausalityActionState = { error?: string } | undefined;

function parseParticipantRole(value: FormDataEntryValue | null) {
  const parsed = z.enum(eventParticipantRoleValues).safeParse(value);
  return parsed.success ? parsed.data : "ACTOR";
}

// Read the indexed participant rows (`participantId_N` / `participantRole_N`,
// counted by `participantCount`) a multi-participant event form submits, deduped
// on (entity, role). Returns `undefined` when no participant rows are present so
// callers can distinguish "leave participants untouched" from "set to empty".
function parseParticipantRows(formData: FormData) {
  if (formData.get("participantCount") == null) return undefined;
  const count = Number(formData.get("participantCount") ?? 0);
  const participants: { entityId: string; role: ReturnType<typeof parseParticipantRole> }[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < Math.min(count, 20); index += 1) {
    const entityId = formData.get(`participantId_${index}`)?.toString().trim();
    if (!entityId) continue;
    const role = parseParticipantRole(formData.get(`participantRole_${index}`));
    const key = `${entityId}:${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    participants.push({ entityId, role });
  }
  return participants;
}

// Read the indexed effect rows an event edit form submits (`effectKind_N` /
// `effectTarget_N` / `effectStat_N` / `effectDelta_N` / `effectValue_N` /
// `effectNote_N` / `effectId_N`, counted by `effectCount`) into raw effect
// objects for the Zod schema to validate. Returns `undefined` when no effect
// rows are present so the service leaves the effect set untouched. Rows without a
// target are skipped (empty trailing rows). `effectValue` carries "alive"/"dead".
function parseEffectRows(formData: FormData) {
  if (formData.get("effectCount") == null) return undefined;
  const count = Number(formData.get("effectCount") ?? 0);
  const effects: Record<string, unknown>[] = [];
  for (let index = 0; index < Math.min(count, 20); index += 1) {
    const targetEntityId = formData.get(`effectTarget_${index}`)?.toString().trim();
    if (!targetEntityId) continue;
    const effect: Record<string, unknown> = {
      kind: formData.get(`effectKind_${index}`)?.toString(),
      targetEntityId,
      note: formData.get(`effectNote_${index}`)?.toString() ?? "",
    };
    const id = formData.get(`effectId_${index}`)?.toString().trim();
    if (id) effect.id = id;
    const stat = formData.get(`effectStat_${index}`)?.toString();
    if (stat) effect.stat = stat;
    const delta = formData.get(`effectDelta_${index}`);
    if (delta != null && delta !== "") effect.delta = delta;
    const valueNumber = formData.get(`effectValueNumber_${index}`);
    if (valueNumber != null && valueNumber !== "") effect.valueNumber = valueNumber;
    const value = formData.get(`effectValue_${index}`);
    if (value != null && value !== "") effect.value = value;
    effects.push(effect);
  }
  return effects;
}

export async function createEventAction(
  campaignId: string,
  sourceId: string,
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const user = await requireUser();

  // The viewed entity is always a participant; one optional co-participant may
  // be added from the same form. The campaign timeline action below handles
  // arbitrary multi-participant logging.
  const participants = [
    { entityId: sourceId, role: parseParticipantRole(formData.get("sourceRole")) },
  ];
  const otherId = formData.get("otherId")?.toString().trim();
  if (otherId) {
    participants.push({
      entityId: otherId,
      role: parseParticipantRole(formData.get("otherRole")),
    });
  }

  const effects = parseEffectRows(formData);
  const parsed = createEventSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary"),
    basis: formData.get("basis"),
    floor: formData.get("floor"),
    offset: formData.get("offset"),
    unit: formData.get("unit"),
    anchorEventId: formData.get("anchorEventId"),
    timeLabel: formData.get("timeLabel"),
    secret: formData.get("secret"),
    participants,
    ...(effects ? { effects } : {}),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await createEvent(user.id, campaignId, parsed.data);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not log the event. Please try again." };
  }

  revalidatePath(`/campaigns/${campaignId}/entities/${sourceId}`);
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  if (otherId) {
    revalidatePath(`/campaigns/${campaignId}/entities/${otherId}`);
  }
  for (const effect of parsed.data.effects ?? []) {
    revalidatePath(`/campaigns/${campaignId}/entities/${effect.targetEntityId}`);
  }
  return undefined;
}

export async function updateEventAction(
  campaignId: string,
  entityId: string,
  eventId: string,
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const user = await requireUser();
  const participants = parseParticipantRows(formData);
  const effects = parseEffectRows(formData);
  const parsed = updateEventSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary"),
    basis: formData.get("basis"),
    floor: formData.get("floor"),
    offset: formData.get("offset"),
    unit: formData.get("unit"),
    anchorEventId: formData.get("anchorEventId"),
    timeLabel: formData.get("timeLabel"),
    secret: formData.get("secret"),
    ...(participants ? { participants } : {}),
    ...(effects ? { effects } : {}),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let result: { participantIds: string[] };
  try {
    result = await updateEvent(user.id, campaignId, eventId, parsed.data);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not edit the event. Please try again." };
  }

  for (const id of new Set([...result.participantIds, entityId])) {
    revalidatePath(`/campaigns/${campaignId}/entities/${id}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  return undefined;
}

// Edit an event from the campaign timeline page (no single "viewed entity"):
// revalidates every affected participant timeline plus the campaign timeline.
export async function updateCampaignEventAction(
  campaignId: string,
  eventId: string,
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const user = await requireUser();
  const participants = parseParticipantRows(formData);
  const effects = parseEffectRows(formData);
  const parsed = updateEventSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary"),
    basis: formData.get("basis"),
    floor: formData.get("floor"),
    offset: formData.get("offset"),
    unit: formData.get("unit"),
    anchorEventId: formData.get("anchorEventId"),
    timeLabel: formData.get("timeLabel"),
    secret: formData.get("secret"),
    ...(participants ? { participants } : {}),
    ...(effects ? { effects } : {}),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let result: { participantIds: string[] };
  try {
    result = await updateEvent(user.id, campaignId, eventId, parsed.data);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not edit the event. Please try again." };
  }

  for (const id of result.participantIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${id}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  return undefined;
}

export async function createCampaignEventAction(
  campaignId: string,
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const user = await requireUser();
  const participantCount = Number(formData.get("participantCount") ?? 0);
  const participants: { entityId: string; role: ReturnType<typeof parseParticipantRole> }[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < Math.min(participantCount, 20); index += 1) {
    const entityId = formData.get(`participantId_${index}`)?.toString().trim();
    if (!entityId) continue;
    const role = parseParticipantRole(formData.get(`participantRole_${index}`));
    const key = `${entityId}:${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    participants.push({ entityId, role });
  }

  if (participants.length === 0) {
    return { error: "Choose at least one participant." };
  }

  const effects = parseEffectRows(formData);
  const parsed = createEventSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary"),
    basis: formData.get("basis"),
    floor: formData.get("floor"),
    offset: formData.get("offset"),
    unit: formData.get("unit"),
    anchorEventId: formData.get("anchorEventId"),
    timeLabel: formData.get("timeLabel"),
    secret: formData.get("secret"),
    participants,
    ...(effects ? { effects } : {}),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await createEvent(user.id, campaignId, parsed.data);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not log the event. Please try again." };
  }

  revalidatePath(`/campaigns/${campaignId}/timeline`);
  for (const participant of parsed.data.participants) {
    revalidatePath(`/campaigns/${campaignId}/entities/${participant.entityId}`);
  }
  for (const effect of parsed.data.effects ?? []) {
    revalidatePath(`/campaigns/${campaignId}/entities/${effect.targetEntityId}`);
  }
  return undefined;
}

// Reorder an event within its floor (intra-floor drag on the timeline). Order is
// mechanical, not canon (ADR 0004), so this bypasses the review pipeline. The
// client passes the ids of the events shown immediately above/below the drop
// slot (null at an end of the list).
export async function setCampaignCurrentFloorAction(
  campaignId: string,
  floorEntityId: string | null,
): Promise<EventActionState> {
  const user = await requireUser();
  try {
    await setCampaignCurrentFloor(user.id, campaignId, floorEntityId);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not set the current floor. Please try again." };
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  return undefined;
}

export async function reorderEventAction(
  campaignId: string,
  eventId: string,
  neighbors: { aboveId?: string | null; belowId?: string | null },
): Promise<EventActionState> {
  const user = await requireUser();
  let result: { participantIds: string[] };
  try {
    result = await reorderEvent(user.id, campaignId, eventId, neighbors);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not reorder the event. Please try again." };
  }

  for (const id of result.participantIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${id}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  return undefined;
}

export async function orderEventsFromCausalityAction(
  campaignId: string,
): Promise<EventActionState> {
  const user = await requireUser();
  let result: { affectedEntityIds: string[] };
  try {
    result = await orderEventsFromCausality(user.id, campaignId);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not order the timeline. Please try again." };
  }

  for (const id of result.affectedEntityIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${id}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  return undefined;
}

export async function archiveEventAction(
  campaignId: string,
  entityId: string,
  eventId: string,
): Promise<void> {
  const user = await requireUser();
  const result = await archiveEvent(user.id, campaignId, eventId);
  const participantIds = new Set([...result.participantIds, entityId]);
  for (const participantId of participantIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${participantId}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

export async function restoreEventAction(
  campaignId: string,
  entityId: string,
  eventId: string,
): Promise<void> {
  const user = await requireUser();
  const result = await restoreEvent(user.id, campaignId, eventId);
  const participantIds = new Set([...result.participantIds, entityId]);
  for (const participantId of participantIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${participantId}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

export async function toggleEventLockAction(
  campaignId: string,
  entityId: string,
  eventId: string,
  locked: boolean,
): Promise<void> {
  const user = await requireUser();
  const result = await setEventLock(user.id, campaignId, eventId, !locked);
  const participantIds = new Set([...result.participantIds, entityId]);
  for (const participantId of participantIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${participantId}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

// Submit an event's effects from the entity Timeline panel: revalidates every
// affected entity (participants + effect targets, plus the viewed entity), the
// campaign timeline, and Review Queue.
export async function applyEventEffectsAction(
  campaignId: string,
  entityId: string,
  eventId: string,
): Promise<EventActionState> {
  const user = await requireUser();
  let result: { affectedEntityIds: string[] };
  try {
    result = await applyEventEffects(user.id, campaignId, eventId);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not submit the effects. Please try again." };
  }
  for (const id of new Set([...result.affectedEntityIds, entityId])) {
    revalidatePath(`/campaigns/${campaignId}/entities/${id}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  revalidatePath(`/campaigns/${campaignId}/review`);
  return undefined;
}

// Submit an event's effects from the campaign timeline page (no single viewed
// entity): revalidates every affected entity, the campaign timeline, and Review
// Queue.
export async function applyCampaignEventEffectsAction(
  campaignId: string,
  eventId: string,
): Promise<EventActionState> {
  const user = await requireUser();
  let result: { affectedEntityIds: string[] };
  try {
    result = await applyEventEffects(user.id, campaignId, eventId);
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not submit the effects. Please try again." };
  }
  for (const id of result.affectedEntityIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${id}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  revalidatePath(`/campaigns/${campaignId}/review`);
  return undefined;
}

export async function linkEventCauseAction(
  campaignId: string,
  entityId: string,
  effectId: string,
  _prev: EventCausalityActionState,
  formData: FormData,
): Promise<EventCausalityActionState> {
  const user = await requireUser();
  const causeId = formData.get("causeId")?.toString().trim();
  if (!causeId) {
    return { error: "Choose a cause event." };
  }
  const rawWeight = formData.get("weight")?.toString().trim();
  const weight =
    rawWeight && Number.isFinite(Number(rawWeight)) ? Number(rawWeight) : undefined;
  const note = formData.get("note")?.toString().trim() || undefined;

  try {
    await linkEventCause(user.id, campaignId, {
      causeId,
      effectId,
      weight,
      note,
    });
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not link the events. Please try again." };
  }

  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  return undefined;
}

export async function archiveEventCausalityAction(
  campaignId: string,
  entityId: string,
  eventCausalityId: string,
): Promise<void> {
  const user = await requireUser();
  await archiveEventCausality(user.id, campaignId, eventCausalityId);
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

export async function restoreEventCausalityAction(
  campaignId: string,
  entityId: string,
  eventCausalityId: string,
): Promise<void> {
  const user = await requireUser();
  await restoreEventCausality(user.id, campaignId, eventCausalityId);
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

// ── Campaign-timeline variants (no single viewed entity) ──
// Same services as the entity-viewer actions, but revalidate the timeline plus
// every affected participant entity page rather than one viewed entity.

export async function setCampaignEventLockAction(
  campaignId: string,
  eventId: string,
  locked: boolean,
): Promise<void> {
  const user = await requireUser();
  const result = await setEventLock(user.id, campaignId, eventId, !locked);
  for (const participantId of result.participantIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${participantId}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

export async function archiveCampaignEventAction(
  campaignId: string,
  eventId: string,
): Promise<void> {
  const user = await requireUser();
  const result = await archiveEvent(user.id, campaignId, eventId);
  for (const participantId of result.participantIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${participantId}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

export async function restoreCampaignEventAction(
  campaignId: string,
  eventId: string,
): Promise<void> {
  const user = await requireUser();
  const result = await restoreEvent(user.id, campaignId, eventId);
  for (const participantId of result.participantIds) {
    revalidatePath(`/campaigns/${campaignId}/entities/${participantId}`);
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

export async function linkCampaignEventCauseAction(
  campaignId: string,
  effectId: string,
  _prev: EventCausalityActionState,
  formData: FormData,
): Promise<EventCausalityActionState> {
  const user = await requireUser();
  const causeId = formData.get("causeId")?.toString().trim();
  if (!causeId) {
    return { error: "Choose a cause event." };
  }
  try {
    await linkEventCause(user.id, campaignId, { causeId, effectId });
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not link the events. Please try again." };
  }
  revalidatePath(`/campaigns/${campaignId}/timeline`);
  return undefined;
}

export async function archiveCampaignEventCausalityAction(
  campaignId: string,
  eventCausalityId: string,
): Promise<void> {
  const user = await requireUser();
  await archiveEventCausality(user.id, campaignId, eventCausalityId);
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

export async function restoreCampaignEventCausalityAction(
  campaignId: string,
  eventCausalityId: string,
): Promise<void> {
  const user = await requireUser();
  await restoreEventCausality(user.id, campaignId, eventCausalityId);
  revalidatePath(`/campaigns/${campaignId}/timeline`);
}

export async function getCampaignCanonIntegrityAction(campaignId: string) {
  const user = await requireUser();
  const { getCampaignCanonIntegrity } = await import("@/server/services/campaigns");
  return getCampaignCanonIntegrity(user.id, campaignId);
}
