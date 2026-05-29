"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Archive, Plus, Save } from "lucide-react";

import {
  archiveEntityAction,
  createCrawlerAction,
  createGenericEntityAction,
  updateEntityAction,
  type EntityActionState,
} from "@/app/(dm)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatEntityType, formatTags, formatVisibility } from "@/lib/entities";
import {
  genericEntityTypeValues,
  visibilityValues,
} from "@/lib/validation";
import type { EntityDetail } from "@/server/services/entities";

function SubmitButton({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {icon}
      {pending ? "Working..." : children}
    </Button>
  );
}

function StateMessage({ state }: { state: EntityActionState }) {
  if (state?.error) {
    return (
      <p role="alert" className="text-sm text-[var(--destructive)]">
        {state.error}
      </p>
    );
  }
  if (state?.success) {
    return <p className="text-sm text-[var(--muted-foreground)]">{state.success}</p>;
  }
  return null;
}

function VisibilitySelect({ defaultValue = "DM_ONLY" }: { defaultValue?: string }) {
  return (
    <select
      id="visibility"
      name="visibility"
      defaultValue={defaultValue}
      className="h-10 rounded-md border border-[var(--input)] bg-transparent px-3 text-sm"
    >
      {visibilityValues.map((visibility) => (
        <option key={visibility} value={visibility}>
          {formatVisibility(visibility)}
        </option>
      ))}
    </select>
  );
}

function CoreFields({
  entity,
}: {
  entity?: Pick<
    EntityDetail,
    "name" | "summary" | "description" | "visibility" | "tags"
  >;
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={entity?.name} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="summary">Summary</Label>
        <Input
          id="summary"
          name="summary"
          defaultValue={entity?.summary ?? ""}
          placeholder="One useful sentence for search and scanning."
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={entity?.description ?? ""}
          placeholder="Markdown notes, canon details, and DM-facing context."
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="visibility">Visibility</Label>
          <VisibilitySelect defaultValue={entity?.visibility ?? "DM_ONLY"} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            name="tags"
            defaultValue={entity ? formatTags(entity.tags) : ""}
            placeholder="floor 1, sponsor, rumor"
          />
        </div>
      </div>
    </>
  );
}

function CrawlerFields({ entity }: { entity?: EntityDetail }) {
  const crawler = entity?.crawler;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="realName">Real name</Label>
        <Input id="realName" name="realName" defaultValue={crawler?.realName ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="crawlerNo">Crawler number</Label>
        <Input id="crawlerNo" name="crawlerNo" defaultValue={crawler?.crawlerNo ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="level">Level</Label>
        <Input
          id="level"
          name="level"
          type="number"
          min={1}
          defaultValue={crawler?.level ?? 1}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="currentFloor">Current floor</Label>
        <Input
          id="currentFloor"
          name="currentFloor"
          type="number"
          min={1}
          defaultValue={crawler?.currentFloor ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="hp">HP</Label>
        <Input id="hp" name="hp" type="number" min={0} defaultValue={crawler?.hp ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mp">MP</Label>
        <Input id="mp" name="mp" type="number" min={0} defaultValue={crawler?.mp ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="gold">Gold</Label>
        <Input
          id="gold"
          name="gold"
          type="number"
          min={0}
          defaultValue={crawler?.gold ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="viewCount">Views</Label>
        <Input
          id="viewCount"
          name="viewCount"
          type="number"
          min={0}
          defaultValue={crawler?.viewCount.toString() ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="followerCount">Followers</Label>
        <Input
          id="followerCount"
          name="followerCount"
          type="number"
          min={0}
          defaultValue={crawler?.followerCount.toString() ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="favoriteCount">Favorites</Label>
        <Input
          id="favoriteCount"
          name="favoriteCount"
          type="number"
          min={0}
          defaultValue={crawler?.favoriteCount.toString() ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="killCount">Kills</Label>
        <Input
          id="killCount"
          name="killCount"
          type="number"
          min={0}
          defaultValue={crawler?.killCount ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="isAlive">Status</Label>
        <select
          id="isAlive"
          name="isAlive"
          defaultValue={crawler?.isAlive === false ? "false" : "true"}
          className="h-10 rounded-md border border-[var(--input)] bg-transparent px-3 text-sm"
        >
          <option value="true">Alive</option>
          <option value="false">Dead</option>
        </select>
      </div>
    </div>
  );
}

export function CreateCrawlerForm({ campaignId }: { campaignId: string }) {
  const [state, action] = useActionState(
    createCrawlerAction.bind(null, campaignId),
    undefined,
  );

  return (
    <form action={action} className="grid gap-4">
      <CoreFields />
      <CrawlerFields />
      <StateMessage state={state} />
      <div>
        <SubmitButton icon={<Plus aria-hidden size={16} />}>Create crawler</SubmitButton>
      </div>
    </form>
  );
}

export function CreateGenericEntityForm({ campaignId }: { campaignId: string }) {
  const [state, action] = useActionState(
    createGenericEntityAction.bind(null, campaignId),
    undefined,
  );

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="type">Type</Label>
        <select
          id="type"
          name="type"
          defaultValue="NPC"
          className="h-10 rounded-md border border-[var(--input)] bg-transparent px-3 text-sm"
        >
          {genericEntityTypeValues.map((type) => (
            <option key={type} value={type}>
              {formatEntityType(type)}
            </option>
          ))}
        </select>
      </div>
      <CoreFields />
      <StateMessage state={state} />
      <div>
        <SubmitButton icon={<Plus aria-hidden size={16} />}>Create entity</SubmitButton>
      </div>
    </form>
  );
}

export function EditEntityForm({
  campaignId,
  entity,
}: {
  campaignId: string;
  entity: EntityDetail;
}) {
  const [state, action] = useActionState(
    updateEntityAction.bind(null, campaignId, entity.id),
    undefined,
  );

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="type" value={entity.type} />
      <CoreFields entity={entity} />
      {entity.type === "CRAWLER" && <CrawlerFields entity={entity} />}
      <StateMessage state={state} />
      <div>
        <SubmitButton icon={<Save aria-hidden size={16} />}>Save entity</SubmitButton>
      </div>
    </form>
  );
}

export function ArchiveEntityForm({
  campaignId,
  entityId,
}: {
  campaignId: string;
  entityId: string;
}) {
  return (
    <form action={archiveEntityAction.bind(null, campaignId, entityId)}>
      <Button type="submit" variant="outline">
        <Archive aria-hidden size={16} />
        Archive
      </Button>
    </form>
  );
}
