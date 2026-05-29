"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { signOut } from "@/server/auth";
import { requireUser } from "@/server/auth/session";
import { createCampaign } from "@/server/services/campaigns";
import {
  createCampaignSchema,
  createCrawlerSchema,
  createGenericEntitySchema,
  updateEntitySchema,
} from "@/lib/validation";
import {
  archiveEntity,
  createCrawler,
  createGenericEntity,
  updateEntity,
} from "@/server/services/entities";

export type CampaignActionState = { error?: string } | undefined;
export type EntityActionState =
  | { error?: string; success?: string }
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

export async function updateEntityAction(
  campaignId: string,
  entityId: string,
  _prev: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  const user = await requireUser();
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
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await updateEntity(user.id, campaignId, entityId, parsed.data);
  } catch {
    return { error: "Could not update the entity. Please try again." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/entities/${entityId}`);
  return { success: "Saved." };
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
