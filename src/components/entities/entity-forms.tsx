"use client";

import { useActionState, useState, createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Plus, Save, X, Eye, EyeOff, Check } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  archiveEntityAction,
  createCrawlerAction,
  createGenericEntityAction,
  quickCreateEntityAction,
  restoreEntityAction,
  updateEntityAction,
  type EntityActionState,
} from "@/app/(dm)/actions";
import { invalidateCampaignStatus } from "@/lib/campaign-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/entities/tag-input";
import { kindFormFields } from "@/components/entities/kind-fields";
import { formatEntityType, formatVisibility } from "@/lib/entities";
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
  className,
  name,
  value,
}: {
  children: ReactNode;
  icon: ReactNode;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "primary" | "outline" | "ghost" | "ok" | "destructive" | "bare";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size={size}
      variant={variant}
      disabled={pending}
      className={className}
      name={name}
      value={value}
    >
      {icon}
      {pending ? "Working..." : children}
    </Button>
  );
}

function splitTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
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
  campaignTags = [],
  itemTypes = [],
}: {
  entity?: EntityDetail;
  values?: Record<string, unknown>;
  campaignTags?: string[];
  itemTypes?: Array<{ id: string; name: string }>;
}) {
  const editCtx = useContext(EditFormContext);
  const visibility = editCtx?.visibility;

  const tagDefaults = values
    ? splitTags(values.tags as string | undefined)
    : entity?.tags ?? [];

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
      {entity && (() => {
        // Bespoke per-type form fields come from the entity-kind registry
        // (ADR 0009) instead of a `type === "X"` ladder: FLOOR's anchors, ITEM's
        // AI description + type + flags, etc. A type with no kind renders nothing
        // extra and falls back to the generic core form. The reader is widened to
        // `unknown` here because a kind field can be any primitive (ITEM's flags
        // are booleans); each field casts to the shape its input needs.
        const KindFields = kindFormFields(entity.type);
        const kindGetVal = (key: string, dbVal: unknown): unknown =>
          values && key in values ? values[key] : dbVal;
        return KindFields ? (
          <KindFields
            entity={entity}
            getVal={kindGetVal}
            isLocked={isLocked}
            itemTypes={itemTypes}
          />
        ) : null;
      })()}
      <div className="grid gap-2">
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input
          id="imageUrl"
          name="imageUrl"
          type="url"
          inputMode="url"
          defaultValue={getVal("imageUrl", entity?.imageUrl ?? "")}
          readOnly={isLocked("imageUrl")}
          placeholder="https://example.com/portrait.png"
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
        {!entity ? (
          <div className="grid gap-2">
            <Label htmlFor="visibility">Visibility</Label>
            <VisibilitySelect
              defaultValue={getVal("visibility", "DM_ONLY") as string}
            />
          </div>
        ) : (
          <input
            type="hidden"
            name="visibility"
            value={visibility ?? (getVal("visibility", entity.visibility) as string)}
          />
        )}
        <div className="grid gap-2">
          <Label htmlFor={isLocked("tags") ? undefined : "tags"}>Tags</Label>
          <TagInput
            id="tags"
            name="tags"
            defaultTags={tagDefaults}
            suggestions={campaignTags}
            readOnly={isLocked("tags")}
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

export function CreateCrawlerForm({
  campaignId,
  campaignTags = [],
}: {
  campaignId: string;
  campaignTags?: string[];
}) {
  const [state, action] = useActionState(
    createCrawlerAction.bind(null, campaignId),
    undefined,
  );

  return (
    <form action={action} className="grid gap-4">
      <CoreFields campaignTags={campaignTags} />
      <CrawlerFields />
      <StateMessage state={state} />
      <div>
        <SubmitButton icon={<Plus aria-hidden size={16} />}>Create crawler</SubmitButton>
      </div>
    </form>
  );
}

export function CreateGenericEntityForm({
  campaignId,
  campaignTags = [],
}: {
  campaignId: string;
  campaignTags?: string[];
}) {
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
      <CoreFields campaignTags={campaignTags} />
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
  itemTypes = [],
  campaignTags = [],
}: {
  campaignId: string;
  entity: EntityDetail;
  itemTypes?: Array<{ id: string; name: string }>;
  campaignTags?: string[];
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
    <form
      id="edit-entity-form"
      key={state?.timestamp}
      action={action}
      onSubmit={() => {
        invalidateCampaignStatus();
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="type" value={entity.type} />
      <CoreFields
        entity={entity}
        values={state?.values}
        campaignTags={campaignTags}
        itemTypes={itemTypes}
      />
      {/* CRAWLER keeps its own satellite-table field block (not an entity-kind
          registry entry — ADR 0009); ITEM/FLOOR bespoke data.* fields render via
          the registry inside CoreFields. */}
      {entity.type === "CRAWLER" && <CrawlerFields entity={entity} values={state?.values} />}
      <StateMessage state={state} />
    </form>
  );
}

function SuccessToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 fade-in flex items-center gap-2 border border-[var(--ok)] bg-[var(--bg-2)] px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-[var(--ok)] shadow-[0_8px_24px_rgba(0,0,0,.45)]">
      <Check aria-hidden size={14} className="shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function QuickCreateStub({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    quickCreateEntityAction.bind(null, campaignId),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && formRef.current) {
      formRef.current.reset();
      const nameInput = formRef.current.elements.namedItem("name") as HTMLInputElement;
      nameInput?.focus();
    }
  }, [state]);

  return (
    <>
      <div className="ml-auto">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="h-7 px-2.5 py-1 text-[11px]"
        >
          <Plus aria-hidden size={13} />
          Create Entity
        </Button>
      </div>
      {open && (
        <div className="fade-in w-[calc(100%+44px)] order-last mt-0 -mb-[14px] -mx-[22px] border-t border-[var(--line)] bg-[var(--bg-2)] px-[22px] py-[10px]">
          <form ref={formRef} action={action} className="flex flex-wrap items-center gap-[10px]">
            <input
              name="name"
              autoFocus
              placeholder="New entity name…"
              required
              className="flex-1 max-w-[320px] bg-[var(--bg)] border border-[var(--line-strong)] text-[var(--ink)] px-2.5 py-1 h-7 text-[12.5px] outline-none rounded-[2px] focus:border-[var(--accent)]"
            />
            <select
              name="type"
              defaultValue="NPC"
              className="h-7 border border-[var(--line-strong)] bg-[var(--bg)] px-2.5 py-1 text-[12.5px] text-[var(--ink)] rounded-[2px] outline-none focus:border-[var(--accent)]"
            >
              {entityTypeValues.map((type) => (
                <option key={type} value={type}>
                  {formatEntityType(type)}
                </option>
              ))}
            </select>
            <SubmitButton
              name="actionType"
              value="stay"
              icon={<Check aria-hidden size={13} />}
              size="sm"
              variant="ok"
              className="h-7 px-2.5 py-1 text-[11px]"
            >
              Create stub
            </SubmitButton>
            <SubmitButton
              name="actionType"
              value="edit"
              icon={<Plus aria-hidden size={13} />}
              size="sm"
              variant="primary"
              className="h-7 px-2.5 py-1 text-[11px]"
            >
              Create and Edit
            </SubmitButton>
          </form>
          {state?.error && (
            <div className="mt-2">
              <p role="alert" className="text-sm text-[var(--destructive)]">
                {state.error}
              </p>
            </div>
          )}
        </div>
      )}
      {state?.success && (
        <SuccessToast key={state.success} message={state.success} />
      )}
    </>
  );
}

export function ArchiveEntityForm({
  campaignId,
  entityId,
  referrerCount = 0,
}: {
  campaignId: string;
  entityId: string;
  /**
   * How many live entities reference this one via a bespoke `data.*` reference
   * field (ADR 0011 Part B). When > 0, archiving asks for confirmation first and
   * warns that those soft references will dangle — archiving never cascades.
   */
  referrerCount?: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const action = archiveEntityAction.bind(null, campaignId, entityId);

  // No referrers → the original single-click archive.
  if (referrerCount === 0) {
    return (
      <form action={action}>
        <Button type="submit" variant="outline">
          <Archive aria-hidden size={16} />
          Archive
        </Button>
      </form>
    );
  }

  const noun = referrerCount === 1 ? "entity references" : "entities reference";
  const subject = referrerCount === 1 ? "Its reference" : "Their references";

  return (
    <form action={action}>
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-[11px] leading-[1.5] text-[var(--destructive)]">
            {referrerCount} {noun} this. {subject} will break — archiving does not
            delete the referrers. Archive anyway?
          </p>
          <div className="flex gap-2">
            <SubmitButton icon={<Archive aria-hidden size={16} />} variant="destructive">
              Archive anyway
            </SubmitButton>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] leading-[1.5] text-[var(--ink-faint)]">
            {referrerCount} {noun} this.
          </p>
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            <Archive aria-hidden size={16} />
            Archive
          </Button>
        </div>
      )}
    </form>
  );
}

export function RestoreEntityUndoForm({
  campaignId,
  entityId,
}: {
  campaignId: string;
  entityId: string;
}) {
  return (
    <form action={restoreEntityAction.bind(null, campaignId, entityId)}>
      <Button type="submit" variant="outline">
        Undo
      </Button>
    </form>
  );
}

const EditFormContext = createContext<{
  error: string | undefined;
  setError: (err: string | undefined) => void;
  visibility: string | undefined;
  setVisibility: (v: string) => void;
} | null>(null);

export function EditFormProvider({
  children,
  initialVisibility,
  isEditing = false,
}: {
  children: ReactNode;
  initialVisibility?: string;
  isEditing?: boolean;
}) {
  const [error, setError] = useState<string | undefined>(undefined);
  const [prevInitialVisibility, setPrevInitialVisibility] = useState(initialVisibility);
  const [prevIsEditing, setPrevIsEditing] = useState(isEditing);
  const [visibility, setVisibility] = useState(initialVisibility);

  if (initialVisibility !== prevInitialVisibility || (!isEditing && prevIsEditing)) {
    setPrevInitialVisibility(initialVisibility);
    setPrevIsEditing(isEditing);
    setVisibility(initialVisibility);
  } else if (isEditing !== prevIsEditing) {
    setPrevIsEditing(isEditing);
  }

  return (
    <EditFormContext.Provider value={{ error, setError, visibility, setVisibility }}>
      {children}
    </EditFormContext.Provider>
  );
}

export function useEditForm() {
  const ctx = useContext(EditFormContext);
  if (!ctx) throw new Error("useEditForm must be used within EditFormProvider");
  return ctx;
}

export function VisibilitySidebarControl({
  initialVisibility,
  isEditing,
  isLocked,
}: {
  initialVisibility: string;
  isEditing: boolean;
  isLocked: boolean;
}) {
  const ctx = useContext(EditFormContext);
  const visibility = ctx?.visibility;
  const setVisibility = ctx?.setVisibility;

  const currentVal = visibility ?? initialVisibility;

  return (
    <div className="flex flex-col gap-1">
      {visibilityValues.map((v) => {
        const active = currentVal === v;
        const disabled = isLocked;

        const handleClick = () => {
          if (isEditing && !disabled && setVisibility) {
            setVisibility(v);
          }
        };

        return (
          <button
            key={v}
            type="button"
            onClick={handleClick}
            disabled={!isEditing || disabled}
            className={cn(
              "flex items-center gap-2 text-[11.5px] text-left w-full transition-colors",
              isEditing && !disabled
                ? "cursor-pointer hover:text-[var(--ink)]"
                : "cursor-default"
            )}
            style={{ color: active ? "var(--ink)" : "var(--ink-faint)" }}
          >
            {active ? (
              <Eye
                aria-hidden
                size={13}
                style={{ color: "var(--ok)" }}
              />
            ) : (
              <EyeOff aria-hidden size={13} />
            )}
            {formatVisibility(v).toLowerCase()}
          </button>
        );
      })}
    </div>
  );
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
