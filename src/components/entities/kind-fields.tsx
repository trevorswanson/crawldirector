"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityDetail } from "@/server/services/entities";

// Client companion to the entity-kind registry (ADR 0009): per-type bespoke
// *form fields*, keyed by EntityType. The pure schema descriptor lives in
// src/lib/entity-kinds (server-safe — imported by validation/patch/review); the
// React rendering for a kind lives here so server code never imports components.
// Adding a bespoke type = a descriptor file there + a FormFields entry here,
// instead of a `type === "X"` IIFE inlined in the entity form.

export interface KindFieldsProps {
  entity: EntityDetail;
  getVal: (
    key: string,
    dbVal: string | number | undefined,
  ) => string | number | undefined;
  isLocked: (fieldKey: string) => boolean;
}

function FloorFields({ entity, getVal, isLocked }: KindFieldsProps) {
  // Floor number ties this entity to the events on that floor (Event.orderKey)
  // and powers the timeline's floor-band header + rail (docs/adr/0005). Theme is
  // the one-line flavour under the header. startDay/collapseDay are the absolute
  // days-since-collapse the floor opened / collapses — anchors that let
  // FLOOR_START / FLOOR_COLLAPSE event times resolve to absolute days (ADR 0008).
  const existingData =
    (entity.data as {
      floorNumber?: number | null;
      theme?: string | null;
      startDay?: number | null;
      collapseDay?: number | null;
    }) || {};
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

const KIND_FIELDS: Record<string, (props: KindFieldsProps) => ReactNode> = {
  FLOOR: FloorFields,
};

/** The bespoke form-fields component for a type, or undefined if it has none. */
export function kindFormFields(
  type: string,
): ((props: KindFieldsProps) => ReactNode) | undefined {
  return KIND_FIELDS[type];
}
