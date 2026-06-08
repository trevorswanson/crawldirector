import { Lock, Unlock } from "lucide-react";

import { toggleEntityFieldLockAction } from "@/app/(dm)/actions";

// Per-field canon lock toggle for the read view. Locked fields can't be
// overwritten by edits or AI generation. Disabled while the whole entity is
// locked. Shared by the entity detail page (summary/description) and the
// entity-kind DisplayPanels (ADR 0009) so the toggle markup lives in one place.
export function FieldLockToggle({
  campaignId,
  entityId,
  field,
  fieldLocked,
  entityLocked,
}: {
  campaignId: string;
  entityId: string;
  field: string;
  fieldLocked: boolean;
  entityLocked: boolean;
}) {
  return (
    <form
      action={toggleEntityFieldLockAction.bind(null, campaignId, entityId)}
      className="shrink-0 self-start"
    >
      <input type="hidden" name="field" value={field} />
      <button
        type="submit"
        disabled={entityLocked}
        title={
          entityLocked
            ? "Whole entity is locked"
            : fieldLocked
              ? "Locked field — click to unlock"
              : "Click to lock this field"
        }
        className="inline-flex cursor-pointer items-center border px-[5px] py-[3px] transition-colors disabled:opacity-50"
        style={{
          borderColor: fieldLocked ? "var(--sys)" : "var(--line)",
          color: fieldLocked ? "var(--sys)" : "var(--ink-faint)",
        }}
      >
        {fieldLocked ? (
          <Lock aria-hidden size={11} />
        ) : (
          <Unlock aria-hidden size={11} />
        )}
      </button>
    </form>
  );
}
