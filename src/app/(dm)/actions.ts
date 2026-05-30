"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { signOut } from "@/server/auth";
import { requireUser } from "@/server/auth/session";
import { ServiceError } from "@/lib/errors";
import { createCampaign } from "@/server/services/campaigns";
import {
  createCampaignSchema,
  createCrawlerSchema,
  createGenericEntitySchema,
  changeOperationDecisionSchema,
  lockFieldSchema,
  reviewEditValueKindSchema,
  updateEntitySchema,
} from "@/lib/validation";
import {
  archiveEntity,
  createCrawler,
  createGenericEntity,
  getEntityForUser,
  updateEntity,
} from "@/server/services/entities";
import {
  approveChangeSet,
  rejectChangeSet,
  setChangeOperationDecision,
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
  } catch {
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
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let entityId: string;
  try {
    const entity = await createGenericEntity(user.id, campaignId, parsed.data);
    entityId = entity.id;
  } catch {
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
    if (error instanceof ServiceError) return { error: error.message };
    return { error: "Could not create the entity. Please try again." };
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
  redirect(`/campaigns/${campaignId}`);
}

export async function approveChangeSetAction(
  campaignId: string,
  changeSetId: string,
): Promise<void> {
  const user = await requireUser();
  await approveChangeSet(user.id, campaignId, changeSetId);
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

export async function editChangeOperationPatchAction(
  campaignId: string,
  changeSetId: string,
  operationId: string,
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const editedPatch = parseReviewEditedPatch(formData);
  if (!editedPatch) return;

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

function parseReviewEditedPatch(formData: FormData): ReviewPatch | null {
  const fields = formData
    .getAll("field")
    .map((field) => (typeof field === "string" ? field.trim() : ""))
    .filter(Boolean);
  const uniqueFields = Array.from(new Set(fields));
  const editedPatch: ReviewPatch = {};

  for (const field of uniqueFields) {
    if (formData.get(`apply:${field}`) !== "on") continue;

    const kind = reviewEditValueKindSchema.safeParse(formData.get(`kind:${field}`));
    const rawValue = formData.get(`value:${field}`);
    if (!kind.success || typeof rawValue !== "string") return null;

    const parsed = parseReviewEditedValue(kind.data, rawValue);
    if (parsed === undefined) return null;
    editedPatch[field] = { to: parsed };
  }

  return Object.keys(editedPatch).length > 0 ? editedPatch : null;
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

export async function getCampaignCanonIntegrityAction(campaignId: string) {
  const user = await requireUser();
  const { getCampaignCanonIntegrity } = await import("@/server/services/campaigns");
  return getCampaignCanonIntegrity(user.id, campaignId);
}

