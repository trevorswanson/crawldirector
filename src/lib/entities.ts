export function formatEntityType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatVisibility(visibility: string) {
  return visibility
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatTags(tags: string[]) {
  return tags.join(", ");
}

/*
 * Presentation semantics for the CrawlDirector design language.
 * See docs/13-design-language.md. These return CSS custom-property references
 * (e.g. "var(--ai)") so components never hardcode hex values.
 */

export interface StatusMeta {
  label: string;
  color: string;
}

// CanonStatus → pill color/label. (LOCKED is a separate `entity.locked` flag,
// not a CanonStatus — surface it with the lock chip, not the status pill.)
export function statusMeta(status: string): StatusMeta {
  switch (status) {
    case "CANON":
      return { label: "Canon", color: "var(--ok)" };
    case "PENDING":
      return { label: "Pending", color: "var(--accent)" };
    case "STALE":
      return { label: "Stale", color: "var(--hot)" };
    case "DRAFT":
      return { label: "Draft", color: "var(--ink-dim)" };
    case "APPROVED":
      return { label: "Approved", color: "var(--ok)" };
    case "PARTIALLY_APPLIED":
      return { label: "Partial", color: "var(--ok)" };
    case "REJECTED":
      return { label: "Rejected", color: "var(--no)" };
    case "SUPERSEDED":
      return { label: "Superseded", color: "var(--hot)" };
    case "ARCHIVED":
      return { label: "Archived", color: "var(--ink-faint)" };
    default:
      return { label: formatEntityType(status), color: "var(--ink-dim)" };
  }
}

export interface ProvenanceMeta {
  short: string;
  label: string;
  color: string;
}

// ChangeSource → source badge. Until the M2 review pipeline records provenance,
// existing canon is treated as DM-authored.
export function provenanceMeta(source: string): ProvenanceMeta {
  switch (source) {
    case "AI":
      return { short: "AI", label: "AI-generated", color: "var(--ai)" };
    case "PLAYER_SUGGESTION":
      return { short: "PLR", label: "Player suggestion", color: "var(--player)" };
    case "IMPORT":
      return { short: "IMP", label: "Imported", color: "var(--import)" };
    case "DM":
    default:
      return { short: "DM", label: "DM-authored", color: "var(--ink-dim)" };
  }
}

// Entity type → a category color for the world-browser "type dot". Grouped by
// role in the world: stars, people, system, groups, places, threats, gear,
// honors, taxonomy.
export function entityTypeColor(type: string): string {
  switch (type) {
    case "CRAWLER":
      return "var(--accent)";
    case "SYSTEM_AI":
      return "var(--ai)";
    case "MOB_TYPE":
    case "BOSS":
      return "var(--del)";
    case "FLOOR":
    case "NEIGHBORHOOD":
    case "LOCATION":
      return "var(--ok)";
    case "FACTION":
    case "ORGANIZATION":
    case "SPONSOR":
    case "SHOW":
    case "GUILD":
    case "PARTY":
    case "DEITY":
      return "var(--sys)";
    case "ITEM":
    case "ITEM_TYPE":
    case "SKILL":
    case "SPELL":
      return "var(--import)";
    case "TITLE":
    case "ACHIEVEMENT":
      return "var(--player)";
    default:
      // NPC, SPECIES, CLASS, SYSTEM_MESSAGE, …
      return "var(--ink-dim)";
  }
}
