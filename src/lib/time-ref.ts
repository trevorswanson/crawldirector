// Structured in-fiction time references for events (ADR 0004 slice 2). DCC has
// no calendar; in-fiction time is always expressed as an *offset from a basis*
// — days since the collapse, time after a floor opened, time until a floor
// collapses, before/after another event — and the books switch between them
// freely. We model that as a small typed structure (`TimeRef`) stored in
// `Event.inGameTime`, and *generate* the human phrasing from it instead of
// making a DM retype a free-text label for every event.
//
// Three concerns stay separate (ADR 0004): the mechanical sort order
// (`orderKey` + fractional `rank`, derived server-side, never authored here),
// the structured anchor (this `TimeRef`), and the narrative phrasing (generated
// by `phraseTimeRef`, with an optional one-off `label` override).

// The basis an offset is measured from. `UNSCHEDULED` means "no usable
// timestamp" — a label-only / manually-ordered event, still first-class.
export const timeBasisValues = [
  "COLLAPSE", // days since the apocalypse / start of the crawl
  "FLOOR_START", // time after a floor opened
  "FLOOR_COLLAPSE", // time until a floor collapses (counts down)
  "EVENT", // before/after another event
  "ABSOLUTE_DAY", // an explicit absolute day index, when known
  "UNSCHEDULED", // no usable timestamp (label-only / manual order)
] as const;
export type TimeBasis = (typeof timeBasisValues)[number];

export const timeUnitValues = ["DAY", "HOUR", "MINUTE"] as const;
export type TimeUnit = (typeof timeUnitValues)[number];

export type TimeRef = {
  basis: TimeBasis;
  floor?: number; // floor-relative bases + general context
  anchorEventId?: string; // required for EVENT basis
  offset?: number; // signed magnitude (e.g. +3, -12)
  unit?: TimeUnit;
  label?: string; // optional human override of the generated phrase
};

// The raw shape callers (forms / the service) assemble before normalizing.
export type TimeRefInput = {
  basis?: TimeBasis;
  floor?: number;
  anchorEventId?: string;
  offset?: number;
  unit?: TimeUnit;
  label?: string;
};

function isTimeBasis(value: unknown): value is TimeBasis {
  return typeof value === "string" && (timeBasisValues as readonly string[]).includes(value);
}

function isTimeUnit(value: unknown): value is TimeUnit {
  return typeof value === "string" && (timeUnitValues as readonly string[]).includes(value);
}

// Bases that carry an offset magnitude. `UNSCHEDULED` never does; everything
// else can (COLLAPSE/ABSOLUTE_DAY count from a global zero, the floor bases from
// the floor's open/collapse, EVENT from the anchor event).
function basisUsesOffset(basis: TimeBasis): boolean {
  return basis !== "UNSCHEDULED";
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// A missing/invalid basis is inferred: a floor implies FLOOR_START, otherwise
// UNSCHEDULED. Keeps the pre-slice-2 "floor + label" forms working and matches
// the migration backfill.
function inferBasis(floor: unknown): TimeBasis {
  return typeof floor === "number" ? "FLOOR_START" : "UNSCHEDULED";
}

// Normalize a raw input into a canonical `TimeRef`, dropping fields that don't
// apply to the chosen basis so the stored JSON stays minimal and coherent. When
// no basis is given it is inferred (a floor implies FLOOR_START, otherwise
// UNSCHEDULED) — this keeps the pre-slice-2 "floor + label" forms working and
// matches the migration backfill.
export function buildTimeRef(input: TimeRefInput): TimeRef {
  const basis: TimeBasis = input.basis ?? inferBasis(input.floor);
  const ref: TimeRef = { basis };

  if (typeof input.floor === "number") ref.floor = input.floor;

  if (basis === "EVENT") {
    const anchorEventId = trimmedOrUndefined(input.anchorEventId);
    if (anchorEventId) ref.anchorEventId = anchorEventId;
  }

  if (basisUsesOffset(basis) && typeof input.offset === "number") {
    ref.offset = input.offset;
    ref.unit = input.unit ?? "DAY";
  }

  const label = trimmedOrUndefined(input.label);
  if (label) ref.label = label;

  return ref;
}

// Parse a stored `Event.inGameTime` JSON value into a `TimeRef`, tolerating both
// the new typed shape and any pre-migration `{ floor?, label? }` rows (a missing
// basis is inferred the same way `buildTimeRef` does).
export function readTimeRef(value: unknown): TimeRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { basis: "UNSCHEDULED" };
  }
  const record = value as Record<string, unknown>;
  const floor = typeof record.floor === "number" ? record.floor : undefined;
  const basis: TimeBasis = isTimeBasis(record.basis) ? record.basis : inferBasis(floor);

  const ref: TimeRef = { basis };
  if (floor != null) ref.floor = floor;
  if (basis === "EVENT" && typeof record.anchorEventId === "string") {
    ref.anchorEventId = record.anchorEventId;
  }
  if (basisUsesOffset(basis) && typeof record.offset === "number") {
    ref.offset = record.offset;
    ref.unit = isTimeUnit(record.unit) ? record.unit : "DAY";
  }
  if (typeof record.label === "string" && record.label.length > 0) {
    ref.label = record.label;
  }
  return ref;
}

function unitWord(unit: TimeUnit, magnitude: number): string {
  const plural = Math.abs(magnitude) === 1 ? "" : "s";
  if (unit === "HOUR") return `hour${plural}`;
  if (unit === "MINUTE") return `minute${plural}`;
  return `day${plural}`;
}

// Generate the human phrase for a `TimeRef`. A DM-supplied `label` always wins
// (the one-off override). Otherwise the phrase is composed from the structure so
// "3 days after the collapse", "Day 3", and "post-collapse d3" all render the
// same way. EVENT-basis phrasing resolves the anchor's title from `anchorTitle`
// when available. Returns null when there is genuinely nothing to show (an
// UNSCHEDULED event with no floor and no label).
export function phraseTimeRef(
  ref: TimeRef,
  options: { anchorTitle?: string | null } = {},
): string | null {
  if (ref.label) return ref.label;

  const { floor, offset, unit, basis } = ref;
  const hasOffset = typeof offset === "number";
  const word = unit ? unitWord(unit, offset ?? 0) : "days";

  switch (basis) {
    case "FLOOR_START":
      if (floor != null && hasOffset) return `Floor ${floor} · ${offset} ${word} in`;
      if (floor != null) return `Floor ${floor}`;
      if (hasOffset) return `${offset} ${word} in`;
      return null;
    case "FLOOR_COLLAPSE":
      if (hasOffset) {
        const falls = floor != null ? `Floor ${floor} falls` : "the floor falls";
        return `${offset} ${word} before ${falls}`;
      }
      if (floor != null) return `Floor ${floor} · before collapse`;
      return null;
    case "COLLAPSE":
      if (hasOffset) {
        return unit === "DAY"
          ? `Day ${offset} since the collapse`
          : `${offset} ${word} since the collapse`;
      }
      return floor != null ? `Floor ${floor}` : null;
    case "ABSOLUTE_DAY":
      if (hasOffset) return `Day ${offset}`;
      return floor != null ? `Floor ${floor}` : null;
    case "EVENT": {
      const anchor = options.anchorTitle?.trim() || "another event";
      if (hasOffset && offset !== 0) {
        const direction = offset < 0 ? "before" : "after";
        return `${Math.abs(offset)} ${word} ${direction} ${anchor}`;
      }
      return `after ${anchor}`;
    }
    case "UNSCHEDULED":
    default:
      return floor != null ? `Floor ${floor}` : null;
  }
}

// The within-floor sort position for a *floor-relative* anchor, used to derive a
// fractional `rank` automatically (ADR 0004). Only FLOOR_START and
// FLOOR_COLLAPSE are derivable: they share the floor as a common clock, so an
// offset maps to a position on one axis where a larger position sorts *later*
// (and the timeline shows later-in-fiction first). FLOOR_START counts up from
// the floor opening; FLOOR_COLLAPSE counts down to collapse, so a larger
// "time remaining" is *earlier* and gets a smaller position. Every other basis
// returns null here and is ordered another way: COLLAPSE / ABSOLUTE_DAY / EVENT
// times that resolve to a concrete day are placed on the absolute-day axis
// (src/lib/time-resolve.ts, ADR 0008), causally-linked events fall back to "order
// from causality" (slice 3), and UNSCHEDULED is manual. This same-basis offset
// path is the fallback for floors with no day anchors, where absolute days are
// unknown but same-basis siblings still share the floor as a common clock. The
// `basis` tag lets the caller compare only same-basis siblings (mixing the two
// floor axes needs floor-duration data we don't model).
export function floorRelativeSortKey(
  ref: TimeRef,
): { basis: "FLOOR_START" | "FLOOR_COLLAPSE"; position: number } | null {
  if (typeof ref.offset !== "number") return null;
  if (ref.basis === "FLOOR_START") {
    return { basis: "FLOOR_START", position: ref.offset };
  }
  if (ref.basis === "FLOOR_COLLAPSE") {
    return { basis: "FLOOR_COLLAPSE", position: -ref.offset };
  }
  return null;
}
