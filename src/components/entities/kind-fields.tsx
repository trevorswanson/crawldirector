"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readKindData } from "@/lib/entity-kinds";
import type { EntityDetail } from "@/server/services/entities";

// Client companion to the entity-kind registry (ADR 0009): per-type bespoke
// *form fields*, keyed by EntityType. The pure schema descriptor lives in
// src/lib/entity-kinds (server-safe — imported by validation/patch/review); the
// React rendering for a kind lives here so server code never imports components.
// Adding a bespoke type = a descriptor file there + a FormFields entry here,
// instead of a `type === "X"` IIFE inlined in the entity form.

export interface KindFieldsProps {
  entity: EntityDetail;
  // Bespoke fields persist as any primitive (text/number/boolean), so the form
  // value reader is intentionally untyped — each field casts to the shape its
  // input needs (FLOOR's numbers/strings, ITEM's checkbox booleans).
  getVal: (key: string, dbVal: unknown) => unknown;
  isLocked: (fieldKey: string) => boolean;
  /**
   * Candidate ITEM_TYPE entities for the ITEM "Item Type" select. Unused by
   * types without a reference field; the page passes it for every kind.
   */
  itemTypes?: Array<{ id: string; name: string }>;
}

function FloorFields({ entity, getVal, isLocked }: KindFieldsProps) {
  // Floor number ties this entity to the events on that floor (Event.orderKey)
  // and powers the timeline's floor-band header + rail (docs/adr/0005). Theme is
  // the one-line flavour under the header. startDay/collapseDay are the absolute
  // days-since-collapse the floor opened / collapses — anchors that let
  // FLOOR_START / FLOOR_COLLAPSE event times resolve to absolute days (ADR 0008).
  // FLOOR bespoke fields live in the 1:1 Floor satellite (ADR 0011 Part C),
  // merged back in by readKindData(type, data, floor).
  const existingData = readKindData("FLOOR", entity.data, entity.floor) as {
    floorNumber?: number | null;
    theme?: string | null;
    startDay?: number | null;
    collapseDay?: number | null;
  };
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="grid gap-2">
          <Label htmlFor="floorNumber">Floor number</Label>
          <Input
            id="floorNumber"
            name="floorNumber"
            type="number"
            min={1}
            defaultValue={getVal("floorNumber", existingData.floorNumber ?? "") as string}
            readOnly={isLocked("data.floorNumber")}
            placeholder="e.g. 9"
          />
          {isLocked("data.floorNumber") && (
            <input type="hidden" name="floorNumber" value={existingData.floorNumber ?? ""} />
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="theme">Theme</Label>
          <Input
            id="theme"
            name="theme"
            defaultValue={getVal("theme", existingData.theme ?? "") as string}
            readOnly={isLocked("data.theme")}
            placeholder="e.g. Castle siege · the moat runs red"
          />
          {isLocked("data.theme") && (
            <input type="hidden" name="theme" value={existingData.theme ?? ""} />
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="startDay">Opens on day</Label>
          <Input
            id="startDay"
            name="startDay"
            type="number"
            min={0}
            defaultValue={getVal("startDay", existingData.startDay ?? "") as string}
            readOnly={isLocked("data.startDay")}
            placeholder="days since collapse"
          />
          {isLocked("data.startDay") && (
            <input type="hidden" name="startDay" value={existingData.startDay ?? ""} />
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="collapseDay">Collapses on day</Label>
          <Input
            id="collapseDay"
            name="collapseDay"
            type="number"
            min={0}
            defaultValue={getVal("collapseDay", existingData.collapseDay ?? "") as string}
            readOnly={isLocked("data.collapseDay")}
            placeholder="days since collapse"
          />
          {isLocked("data.collapseDay") && (
            <input type="hidden" name="collapseDay" value={existingData.collapseDay ?? ""} />
          )}
        </div>
      </div>
    </>
  );
}

function ItemFields({ entity, itemTypes = [], getVal, isLocked }: KindFieldsProps) {
  // ITEM bespoke fields (ADR 0009): aiDescription is the official system
  // commentary / flavour text; itemTypeId links to an ITEM_TYPE entity; divine/
  // unique/fleeting are DCC item flags. The detail page composes the flags +
  // aiDescription into the read-view blockquote (see kind-display.tsx).
  const existingData = readKindData("ITEM", entity.data) as {
    itemTypeId?: string | null;
    divine?: boolean;
    unique?: boolean;
    fleeting?: boolean;
    aiDescription?: string | null;
  };

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="aiDescription">AI Description</Label>
        <Textarea
          id="aiDescription"
          name="aiDescription"
          defaultValue={getVal("aiDescription", existingData.aiDescription ?? undefined) as string}
          readOnly={isLocked("data.aiDescription")}
          placeholder="Official system commentary / flavor text."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="itemTypeId">Item Type</Label>
          <select
            id="itemTypeId"
            name="itemTypeId"
            defaultValue={getVal("itemTypeId", existingData.itemTypeId ?? "") as string}
            disabled={isLocked("data.itemTypeId")}
            className="h-10 rounded-md border border-[var(--input)] bg-transparent px-3 text-sm disabled:opacity-60 disabled:bg-[var(--bg-3)] disabled:cursor-not-allowed"
          >
            <option value="">— None —</option>
            {itemTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          {isLocked("data.itemTypeId") && (
            <input type="hidden" name="itemTypeId" value={existingData.itemTypeId ?? ""} />
          )}
        </div>

        <div className="grid gap-2">
          <Label>Attributes</Label>
          <div className="flex flex-wrap gap-4 py-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                id="divine"
                name="divine"
                value="true"
                defaultChecked={getVal("divine", existingData.divine ?? false) as boolean}
                disabled={isLocked("data.divine")}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
              />
              Divine
            </label>
            {isLocked("data.divine") && (
              <input type="hidden" name="divine" value={existingData.divine ? "true" : "false"} />
            )}

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                id="unique"
                name="unique"
                value="true"
                defaultChecked={getVal("unique", existingData.unique ?? false) as boolean}
                disabled={isLocked("data.unique")}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
              />
              Unique
            </label>
            {isLocked("data.unique") && (
              <input type="hidden" name="unique" value={existingData.unique ? "true" : "false"} />
            )}

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                id="fleeting"
                name="fleeting"
                value="true"
                defaultChecked={getVal("fleeting", existingData.fleeting ?? false) as boolean}
                disabled={isLocked("data.fleeting")}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
              />
              Fleeting
            </label>
            {isLocked("data.fleeting") && (
              <input type="hidden" name="fleeting" value={existingData.fleeting ? "true" : "false"} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function FactionFields({ entity, getVal, isLocked }: KindFieldsProps) {
  // FACTION bespoke fields (ADR 0011 Part C) live in the 1:1 Faction satellite,
  // merged back in by readKindData(type, data, faction). standing/strength are
  // indexed power metrics (M9/M12); allegiance/resources are descriptive text.
  const existingData = readKindData("FACTION", entity.data, entity.faction) as {
    standing?: number | null;
    strength?: number | null;
    allegiance?: string | null;
    resources?: string | null;
  };
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="standing">Standing</Label>
          <Input
            id="standing"
            name="standing"
            type="number"
            min={0}
            defaultValue={getVal("standing", existingData.standing ?? "") as string}
            readOnly={isLocked("data.standing")}
            placeholder="reputation / influence"
          />
          {isLocked("data.standing") && (
            <input type="hidden" name="standing" value={existingData.standing ?? ""} />
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="strength">Strength</Label>
          <Input
            id="strength"
            name="strength"
            type="number"
            min={0}
            defaultValue={getVal("strength", existingData.strength ?? "") as string}
            readOnly={isLocked("data.strength")}
            placeholder="raw power rating"
          />
          {isLocked("data.strength") && (
            <input type="hidden" name="strength" value={existingData.strength ?? ""} />
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="allegiance">Allegiance</Label>
        <Input
          id="allegiance"
          name="allegiance"
          defaultValue={getVal("allegiance", existingData.allegiance ?? "") as string}
          readOnly={isLocked("data.allegiance")}
          placeholder="e.g. The System · Crawler-aligned"
        />
        {isLocked("data.allegiance") && (
          <input type="hidden" name="allegiance" value={existingData.allegiance ?? ""} />
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="resources">Resources</Label>
        <Textarea
          id="resources"
          name="resources"
          defaultValue={getVal("resources", existingData.resources ?? undefined) as string}
          readOnly={isLocked("data.resources")}
          placeholder="Assets, holdings, and forces this faction commands."
        />
        {isLocked("data.resources") && (
          <input type="hidden" name="resources" value={existingData.resources ?? ""} />
        )}
      </div>
    </>
  );
}

const KIND_FIELDS: Record<string, (props: KindFieldsProps) => ReactNode> = {
  FLOOR: FloorFields,
  ITEM: ItemFields,
  FACTION: FactionFields,
};

/** The bespoke form-fields component for a type, or undefined if it has none. */
export function kindFormFields(
  type: string,
): ((props: KindFieldsProps) => ReactNode) | undefined {
  return KIND_FIELDS[type];
}
