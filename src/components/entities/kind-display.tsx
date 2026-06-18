"use client";

import { AlertTriangle } from "lucide-react";

import { FieldLockToggle } from "@/components/entities/field-lock-toggle";
import { Markdown } from "@/components/ui/markdown";
import { dataKeysFor, readKindData, RESERVED_DATA_KEY } from "@/lib/entity-kinds";
import { cn } from "@/lib/utils";
import type { EntityDetail } from "@/server/services/entities";

// Client companion to the entity-kind registry (ADR 0009): per-type bespoke
// *read-view display*, keyed by EntityType — the counterpart to the form-field
// companion in kind-fields.tsx. The pure schema descriptor lives in
// src/lib/entity-kinds (server-safe); the detail page (a server component)
// renders the `<KindDisplay>` dispatcher, which does the registry lookup on the
// client (a server component can't call a function exported from a client
// module). A type with no descriptor renders nothing — the generic display.

export interface KindDisplayProps {
  campaignId: string;
  entityId: string;
  entity: EntityDetail;
  /**
   * The bespoke `data.*` reference fields a type resolves to a display name
   * server-side (e.g. an ITEM's `itemTypeId` → its ITEM_TYPE entity name). The
   * page resolves these because the panel is a client component without DB access.
   */
  resolvedNames?: Record<string, string | null>;
  /**
   * Reference-field patch keys (e.g. `data.itemTypeId`) whose stored target is
   * broken — missing, archived, or the wrong type (ADR 0011 Part B). The row
   * renders a "broken reference" badge instead of the resolved name. DM-only: the
   * page only flags references that don't resolve in the DM's full-canon scope, so
   * a player's hidden target never masquerades as broken (invariant #5).
   */
  brokenReferences?: string[];
}

type ItemData = {
  itemTypeId?: string | null;
  divine?: boolean;
  unique?: boolean;
  fleeting?: boolean;
  aiDescription?: string | null;
};

type FloorData = {
  floorNumber?: number | null;
  theme?: string | null;
  startDay?: number | null;
  collapseDay?: number | null;
};

// Which `data.*` keys a type's panel already renders, so the generic "additional
// data" fallback shows only the rest. Derived from the entity-kind descriptor
// (ADR 0011) — it can no longer drift from the schema as a hand-maintained map
// did — plus the reserved `_v` version stamp, which is metadata, never displayed.
function handledDataKeys(type: string): Set<string> {
  return new Set([...dataKeysFor(type), RESERVED_DATA_KEY]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function humanizeDataKey(key: string): string {
  const label = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDataValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDay(value: number | null | undefined): string {
  return typeof value === "number" ? `Day ${value}` : "—";
}

// A reference field whose stored target no longer resolves (ADR 0011 Part B).
// Warning-colored so a DM spots the dangling soft FK; the archive impact warning
// is the other half of the same integrity surface.
function BrokenReferenceBadge() {
  return (
    <span
      className="inline-flex items-center gap-[5px] border px-[6px] py-px font-mono text-[10px] uppercase tracking-[.06em]"
      style={{
        borderColor: "var(--destructive)",
        color: "var(--destructive)",
      }}
      title="This reference points at an entity that is missing, archived, or the wrong type."
    >
      <AlertTriangle aria-hidden size={11} />
      Broken reference
    </span>
  );
}

function DetailRows({
  rows,
  entity,
  campaignId,
  entityId,
  brokenReferences,
}: {
  rows: Array<{ key: string; label: string; value: string }>;
  entity: EntityDetail;
  campaignId: string;
  entityId: string;
  brokenReferences?: string[];
}) {
  const isLocked = (field: string) =>
    entity.locked || entity.lockedFields.includes(field);

  return (
    <div className="mt-[18px] panel">
      {rows.map((f, i) => (
        <div
          key={f.key}
          className={cn(
            "grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-[14px] px-[14px] py-[11px] sm:grid-cols-[140px_minmax(0,1fr)_auto]",
            i && "border-t border-[var(--line)]",
          )}
        >
          <span className="font-mono text-[10.5px] uppercase tracking-[.06em] text-[var(--ink-faint)]">
            {f.label}
          </span>
          {brokenReferences?.includes(f.key) ? (
            <span className="min-w-0">
              <BrokenReferenceBadge />
            </span>
          ) : (
            <span className="min-w-0 break-words text-[13.5px] text-[var(--ink)]">
              {f.value}
            </span>
          )}
          <FieldLockToggle
            campaignId={campaignId}
            entityId={entityId}
            field={f.key}
            fieldLocked={isLocked(f.key)}
            entityLocked={entity.locked}
          />
        </div>
      ))}
    </div>
  );
}

// The official system commentary an ITEM detail page composes: the divine/unique/
// fleeting flags become leading sentences, followed by the authored/AI flavor
// text. Empty when there is neither a flag nor a description.
function composeItemAiDescription(data: ItemData): string {
  let prefix = "";
  if (data.divine) prefix += "This is a divine item.\n";
  if (data.unique) prefix += "This is a unique item.\n";
  if (data.fleeting) prefix += "This is a fleeting item.\n";
  if (!prefix && !data.aiDescription) return "";
  return prefix + (prefix && data.aiDescription ? "\n" : "") + (data.aiDescription || "");
}

function ItemDisplayPanel({
  campaignId,
  entityId,
  entity,
  resolvedNames,
  brokenReferences,
}: KindDisplayProps) {
  const data = readKindData("ITEM", entity.data) as ItemData;
  const isLocked = (field: string) =>
    entity.locked || entity.lockedFields.includes(field);

  const rendered = composeItemAiDescription(data);
  const aiDescLocked = isLocked("data.aiDescription");

  const rows: Array<{ key: string; label: string; value: string }> = [
    {
      key: "data.itemTypeId",
      label: "Item Type",
      value: resolvedNames?.["data.itemTypeId"] ?? "—",
    },
    { key: "data.divine", label: "Divine", value: data.divine ? "Yes" : "No" },
    { key: "data.unique", label: "Unique", value: data.unique ? "Yes" : "No" },
    { key: "data.fleeting", label: "Fleeting", value: data.fleeting ? "Yes" : "No" },
  ];

  return (
    <>
      {(rendered || aiDescLocked) && (
        <div className="mt-4 flex items-start justify-between gap-4">
          <blockquote
            className="border-l-2 pl-4 text-[var(--ink-dim)] font-mono flex-1 min-h-[24px]"
            style={{ borderLeftColor: "var(--accent)" }}
          >
            {rendered ? (
              <Markdown content={rendered} />
            ) : (
              <span className="text-[var(--ink-faint)] italic">
                Empty AI description (locked)
              </span>
            )}
          </blockquote>
          <FieldLockToggle
            campaignId={campaignId}
            entityId={entityId}
            field="data.aiDescription"
            fieldLocked={aiDescLocked}
            entityLocked={entity.locked}
          />
        </div>
      )}
      <DetailRows
        rows={rows}
        entity={entity}
        campaignId={campaignId}
        entityId={entityId}
        brokenReferences={brokenReferences}
      />
    </>
  );
}

function FloorDisplayPanel({ campaignId, entityId, entity }: KindDisplayProps) {
  const data = readKindData("FLOOR", entity.data) as FloorData;
  const rows: Array<{ key: string; label: string; value: string }> = [
    {
      key: "data.floorNumber",
      label: "Floor number",
      value: formatDataValue(data.floorNumber),
    },
    {
      key: "data.theme",
      label: "Theme",
      value: formatDataValue(data.theme),
    },
    {
      key: "data.startDay",
      label: "Opens",
      value: formatDay(data.startDay),
    },
    {
      key: "data.collapseDay",
      label: "Collapses",
      value: formatDay(data.collapseDay),
    },
  ];

  return (
    <DetailRows
      rows={rows}
      entity={entity}
      campaignId={campaignId}
      entityId={entityId}
    />
  );
}

function AdditionalDataDisplay({
  campaignId,
  entityId,
  entity,
}: KindDisplayProps) {
  const data = isRecord(entity.data) ? entity.data : {};
  const handled = handledDataKeys(entity.type);
  const rows = Object.entries(data)
    .filter(([key]) => !handled.has(key))
    .map(([key, value]) => ({
      key: `data.${key}`,
      label: humanizeDataKey(key),
      value: formatDataValue(value),
    }));

  if (rows.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
        Additional data
      </p>
      <DetailRows
        rows={rows}
        entity={entity}
        campaignId={campaignId}
        entityId={entityId}
      />
    </div>
  );
}

const KIND_DISPLAY: Record<string, (props: KindDisplayProps) => React.ReactNode> = {
  ITEM: ItemDisplayPanel,
  FLOOR: FloorDisplayPanel,
};

/**
 * Client dispatcher for the per-type read-view display. The server detail page
 * renders `<KindDisplay …>` and this does the registry lookup on the client,
 * returning the type's panel or null. (A server component can't call a function
 * exported from a `"use client"` module, so the lookup must live here.)
 */
export function KindDisplay(props: KindDisplayProps) {
  const Panel = KIND_DISPLAY[props.entity.type];
  return (
    <>
      {Panel ? <Panel {...props} /> : null}
      <AdditionalDataDisplay {...props} />
    </>
  );
}
