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
            <span className="min-w-0 truncate text-[13.5px] text-[var(--ink)]">
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
    </>
  );
}

const KIND_DISPLAY: Record<string, (props: KindDisplayProps) => React.ReactNode> = {
  ITEM: ItemDisplayPanel,
};

/**
 * Client dispatcher for the per-type read-view display. The server detail page
 * renders `<KindDisplay …>` and this does the registry lookup on the client,
 * returning the type's panel or null. (A server component can't call a function
 * exported from a `"use client"` module, so the lookup must live here.)
 */
export function KindDisplay(props: KindDisplayProps) {
  const Panel = KIND_DISPLAY[props.entity.type];
  return Panel ? <Panel {...props} /> : null;
}
