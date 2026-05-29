"use client";

import { useActionState, useState, createContext, useContext, useEffect } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Plus, Save, X } from "lucide-react";

import {
  archiveEntityAction,
  createCrawlerAction,
  createGenericEntityAction,
  quickCreateEntityAction,
  updateEntityAction,
  type EntityActionState,
} from "@/app/(dm)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatEntityType, formatTags, formatVisibility } from "@/lib/entities";
import {
  entityTypeValues,
  genericEntityTypeValues,
  visibilityValues,
} from "@/lib/validation";
import type { EntityDetail } from "@/server/services/entities";

function SubmitButton({
  children,
  icon,
  size,
  variant,
}: {
  children: ReactNode;
  icon: ReactNode;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "primary" | "outline" | "ghost" | "ok" | "destructive" | "bare";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} variant={variant} disabled={pending}>
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

function VisibilitySelect({
  defaultValue = "DM_ONLY",
  disabled,
}: {
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <select
      id="visibility"
      name="visibility"
      defaultValue={defaultValue}
      disabled={disabled}
      className="h-10 rounded-md border border-[var(--input)] bg-transparent px-3 text-sm disabled:opacity-60 disabled:bg-[var(--bg-3)] disabled:cursor-not-allowed"
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
  values,
}: {
  entity?: EntityDetail;
  values?: Record<string, unknown>;
}) {
  const isLocked = (fieldKey: string) => {
    if (!entity) return false;
    return entity.locked || entity.lockedFields.includes(fieldKey);
  };

  const getVal = (key: string, dbVal: string | number | undefined) => {
    if (values && key in values) {
      return values[key] as string | number | undefined;
    }
    return dbVal;
  };

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={getVal("name", entity?.name)}
          readOnly={isLocked("name")}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="summary">Summary</Label>
        <Input
          id="summary"
          name="summary"
          defaultValue={getVal("summary", entity?.summary ?? "")}
          readOnly={isLocked("summary")}
          placeholder="One useful sentence for search and scanning."
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={getVal("description", entity?.description ?? "")}
          readOnly={isLocked("description")}
          placeholder="Markdown notes, canon details, and DM-facing context."
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="visibility">Visibility</Label>
          <VisibilitySelect
            defaultValue={getVal("visibility", entity?.visibility ?? "DM_ONLY") as string}
            disabled={isLocked("visibility")}
          />
          {isLocked("visibility") && (
            <input type="hidden" name="visibility" value={entity?.visibility} />
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            name="tags"
            defaultValue={values ? (values.tags as string) : (entity ? formatTags(entity.tags) : "")}
            readOnly={isLocked("tags")}
            placeholder="floor 1, sponsor, rumor"
          />
        </div>
      </div>
    </>
  );
}

function CrawlerFields({
  entity,
  values,
}: {
  entity?: EntityDetail;
  values?: Record<string, unknown>;
}) {
  const crawler = entity?.crawler;
  const isLocked = (fieldKey: string) => {
    if (!entity) return false;
    return entity.locked || entity.lockedFields.includes(fieldKey);
  };

  const getVal = (key: string, dbVal: string | number | undefined) => {
    if (values && key in values) {
      return values[key] as string | number | undefined;
    }
    return dbVal;
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="realName">Real name</Label>
        <Input
          id="realName"
          name="realName"
          defaultValue={getVal("realName", crawler?.realName ?? "")}
          readOnly={isLocked("crawler.realName")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="crawlerNo">Crawler number</Label>
        <Input
          id="crawlerNo"
          name="crawlerNo"
          defaultValue={getVal("crawlerNo", crawler?.crawlerNo ?? "")}
          readOnly={isLocked("crawler.crawlerNo")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="level">Level</Label>
        <Input
          id="level"
          name="level"
          type="number"
          min={1}
          defaultValue={getVal("level", crawler?.level ?? 1)}
          readOnly={isLocked("crawler.level")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="currentFloor">Current floor</Label>
        <Input
          id="currentFloor"
          name="currentFloor"
          type="number"
          min={1}
          defaultValue={getVal("currentFloor", crawler?.currentFloor ?? "")}
          readOnly={isLocked("crawler.currentFloor")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="hp">HP</Label>
        <Input
          id="hp"
          name="hp"
          type="number"
          min={0}
          defaultValue={getVal("hp", crawler?.hp ?? "")}
          readOnly={isLocked("crawler.hp")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mp">MP</Label>
        <Input
          id="mp"
          name="mp"
          type="number"
          min={0}
          defaultValue={getVal("mp", crawler?.mp ?? "")}
          readOnly={isLocked("crawler.mp")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="gold">Gold</Label>
        <Input
          id="gold"
          name="gold"
          type="number"
          min={0}
          defaultValue={getVal("gold", crawler?.gold ?? 0)}
          readOnly={isLocked("crawler.gold")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="viewCount">Views</Label>
        <Input
          id="viewCount"
          name="viewCount"
          type="number"
          min={0}
          defaultValue={getVal("viewCount", crawler?.viewCount?.toString() ?? "0")}
          readOnly={isLocked("crawler.viewCount")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="followerCount">Followers</Label>
        <Input
          id="followerCount"
          name="followerCount"
          type="number"
          min={0}
          defaultValue={getVal("followerCount", crawler?.followerCount?.toString() ?? "0")}
          readOnly={isLocked("crawler.followerCount")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="favoriteCount">Favorites</Label>
        <Input
          id="favoriteCount"
          name="favoriteCount"
          type="number"
          min={0}
          defaultValue={getVal("favoriteCount", crawler?.favoriteCount?.toString() ?? "0")}
          readOnly={isLocked("crawler.favoriteCount")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="killCount">Kills</Label>
        <Input
          id="killCount"
          name="killCount"
          type="number"
          min={0}
          defaultValue={getVal("killCount", crawler?.killCount ?? 0)}
          readOnly={isLocked("crawler.killCount")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="isAlive">Status</Label>
        <select
          id="isAlive"
          name="isAlive"
          defaultValue={getVal("isAlive", crawler?.isAlive === false ? "false" : "true")?.toString()}
          disabled={isLocked("crawler.isAlive")}
          className="h-10 rounded-md border border-[var(--input)] bg-transparent px-3 text-sm disabled:opacity-60 disabled:bg-[var(--bg-3)] disabled:cursor-not-allowed"
        >
          <option value="true">Alive</option>
          <option value="false">Dead</option>
        </select>
        {isLocked("crawler.isAlive") && (
          <input
            type="hidden"
            name="isAlive"
            value={getVal("isAlive", crawler?.isAlive === false ? "false" : "true")?.toString()}
          />
        )}
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
  const { setError } = useEditForm();
  const router = useRouter();

  useEffect(() => {
    setError(state?.error);
  }, [state?.error, setError]);

  useEffect(() => {
    setError(undefined);
  }, [setError]);

  useEffect(() => {
    if (entity.locked && !state?.error) {
      router.replace(`/campaigns/${campaignId}/entities/${entity.id}`);
    }
  }, [entity.locked, state?.error, campaignId, entity.id, router]);

  return (
    <form id="edit-entity-form" key={state?.timestamp} action={action} className="grid gap-4">
      <input type="hidden" name="type" value={entity.type} />
      <CoreFields entity={entity} values={state?.values} />
      {entity.type === "CRAWLER" && <CrawlerFields entity={entity} values={state?.values} />}
      <StateMessage state={state} />
    </form>
  );
}

export function QuickCreateStub({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    quickCreateEntityAction.bind(null, campaignId),
    undefined,
  );

  return (
    <div className="relative">
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setOpen((o) => !o)}
      >
        <Plus aria-hidden size={13} />
        Quick-create stub
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[340px] border border-[var(--line-strong)] bg-[var(--bg-2)] p-3 shadow-[0_12px_32px_rgba(0,0,0,.45)]">
          <form action={action} className="grid gap-2">
            <Input name="name" autoFocus placeholder="New entity name…" required />
            <select
              name="type"
              defaultValue="NPC"
              className="h-9 border border-[var(--line-strong)] bg-[var(--bg)] px-2 text-sm"
            >
              {entityTypeValues.map((type) => (
                <option key={type} value={type}>
                  {formatEntityType(type)}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-2">
              <SubmitButton icon={<Plus aria-hidden size={13} />} size="sm">
                Create stub
              </SubmitButton>
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                thin reference · flesh out later
              </span>
            </div>
            <StateMessage state={state} />
          </form>
        </div>
      )}
    </div>
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

const EditFormContext = createContext<{
  error: string | undefined;
  setError: (err: string | undefined) => void;
} | null>(null);

export function EditFormProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | undefined>(undefined);
  return (
    <EditFormContext.Provider value={{ error, setError }}>
      {children}
    </EditFormContext.Provider>
  );
}

export function useEditForm() {
  const ctx = useContext(EditFormContext);
  if (!ctx) throw new Error("useEditForm must be used within EditFormProvider");
  return ctx;
}

export function EditRailControls({ detailHref }: { detailHref: string }) {
  const { error } = useEditForm();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="submit"
          form="edit-entity-form"
          className="inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--accent)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--accent-ink)] transition-[filter,color] hover:brightness-110 cursor-pointer"
        >
          <Save aria-hidden size={12} />
          Save
        </button>
        <Link
          href={detailHref}
          className="inline-flex items-center gap-[6px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[10px] py-[5px] font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-dim)] transition-[filter,color] hover:text-[var(--ink)] hover:brightness-110"
        >
          <X aria-hidden size={12} />
          Discard
        </Link>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[11px] leading-[1.4] text-[var(--destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}
