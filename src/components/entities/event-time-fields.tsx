"use client";

import { useState } from "react";

import {
  timeBasisValues,
  timeUnitValues,
  type TimeBasisValue,
  type TimeUnitValue,
} from "@/lib/validation";

// Plain-language label per basis for the picker (ADR 0004 slice 2). The phrasing
// itself is generated server-side from the structured anchor (src/lib/time-ref).
const basisLabels: Record<TimeBasisValue, string> = {
  UNSCHEDULED: "Unscheduled",
  FLOOR_START: "After floor opened",
  FLOOR_COLLAPSE: "Before floor falls",
  COLLAPSE: "Days since collapse",
  ABSOLUTE_DAY: "Absolute day",
  EVENT: "Before/after an event",
};

export type EventTimeInitial = {
  basis?: TimeBasisValue | null;
  floor?: number | null;
  offset?: number | null;
  unit?: TimeUnitValue | null;
  anchorEventId?: string | null;
  label?: string | null;
};

const inputClass =
  "border border-[var(--line-strong)] bg-[var(--bg)] px-2 py-[6px] text-[12px] text-[var(--ink)] disabled:opacity-50";

// The structured in-fiction time editor shared by the event create/edit forms.
// Emits `basis`, `floor`, `offset`, `unit`, `anchorEventId`, and the optional
// `timeLabel` override as plain form fields the event Server Actions parse.
export function EventTimeFields({
  initial,
  anchorCandidates,
  excludeEventId,
}: {
  initial?: EventTimeInitial;
  anchorCandidates?: { id: string; title: string }[];
  excludeEventId?: string;
}) {
  const initialBasis: TimeBasisValue =
    initial?.basis ?? (initial?.floor != null ? "FLOOR_START" : "UNSCHEDULED");
  const [basis, setBasis] = useState<TimeBasisValue>(initialBasis);
  const usesOffset = basis !== "UNSCHEDULED";
  const isEvent = basis === "EVENT";
  const candidates = (anchorCandidates ?? []).filter(
    (candidate) => candidate.id !== excludeEventId,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="floor"
          type="number"
          min={1}
          max={18}
          defaultValue={initial?.floor ?? ""}
          aria-label="Floor"
          placeholder="Floor"
          className={`${inputClass} w-[80px]`}
        />
        <span className="text-[var(--ink-faint)] select-none" aria-hidden>·</span>
        <input
          name="offset"
          type="number"
          defaultValue={initial?.offset ?? ""}
          disabled={!usesOffset}
          aria-label="Time offset"
          placeholder="Offset"
          className={`${inputClass} w-[80px]`}
        />
        <select
          name="unit"
          aria-label="Time unit"
          defaultValue={initial?.unit ?? "DAY"}
          disabled={!usesOffset}
          className={`${inputClass} font-mono text-[11px]`}
        >
          {timeUnitValues.map((value) => (
            <option key={value} value={value}>
              {value.toLowerCase()}
            </option>
          ))}
        </select>
        <select
          name="basis"
          aria-label="Time basis"
          value={basis}
          onChange={(event) => setBasis(event.target.value as TimeBasisValue)}
          className={`${inputClass} font-mono text-[11px]`}
        >
          {timeBasisValues.map((value) => (
            <option key={value} value={value}>
              {basisLabels[value]}
            </option>
          ))}
        </select>
      </div>
      {isEvent && (
        <select
          name="anchorEventId"
          aria-label="Anchor event"
          defaultValue={initial?.anchorEventId ?? ""}
          className={`${inputClass} font-mono text-[11px]`}
        >
          <option value="">Choose anchor event…</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
      )}
      <input
        name="timeLabel"
        maxLength={120}
        defaultValue={initial?.label ?? ""}
        aria-label="Time label"
        placeholder="Label override (optional)"
        className={`${inputClass} min-w-0 flex-1`}
      />
    </div>
  );
}
