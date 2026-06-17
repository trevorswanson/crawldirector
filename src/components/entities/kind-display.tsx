"use client";

import { FieldLockToggle } from "@/components/entities/field-lock-toggle";
import { Markdown } from "@/components/ui/markdown";
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

const HANDLED_DATA_KEYS: Record<string, Set<string>> = {
  ITEM: new Set(["itemTypeId", "divine", "unique", "fleeting", "aiDescription"]),
  FLOOR: new Set(["floorNumber", "theme", "startDay", "collapseDay"]),
};

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

function DetailRows({
  rows,
  entity,
  campaignId,
  entityId,
}: {
  rows: Array<{ key: string; label: string; value: string }>;
  entity: EntityDetail;
  campaignId: string;
  entityId: string;
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
          <span className="min-w-0 break-words text-[13.5px] text-[var(--ink)]">
            {f.value}
          </span>
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
}: KindDisplayProps) {
  const data = (entity.data as ItemData) || {};
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
      />
    </>
  );
}

function FloorDisplayPanel({ campaignId, entityId, entity }: KindDisplayProps) {
  const data = (entity.data as FloorData) || {};
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
  const handled = HANDLED_DATA_KEYS[entity.type] ?? new Set<string>();
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
