import { describe, expect, it } from "vitest";

import {
  entityTypeColor,
  formatEntityType,
  formatTags,
  formatVisibility,
  provenanceMeta,
  statusMeta,
} from "@/lib/entities";

describe("entity formatting helpers", () => {
  it("formats enum-like values for display", () => {
    expect(formatEntityType("SYSTEM_AI")).toBe("System Ai");
    expect(formatVisibility("SHARED_WITH_PLAYERS")).toBe("Shared With Players");
  });

  it("formats tags as a comma-separated string", () => {
    expect(formatTags(["floor 1", "boss"])).toBe("floor 1, boss");
  });
});

describe("statusMeta", () => {
  it("maps each canon status to a label and color", () => {
    expect(statusMeta("CANON")).toEqual({ label: "Canon", color: "var(--ok)" });
    expect(statusMeta("PENDING").color).toBe("var(--accent)");
    expect(statusMeta("STALE")).toEqual({ label: "Stale", color: "var(--hot)" });
    expect(statusMeta("DRAFT").label).toBe("Draft");
    expect(statusMeta("APPROVED").label).toBe("Approved");
    expect(statusMeta("PARTIALLY_APPLIED").label).toBe("Partial");
    expect(statusMeta("REJECTED").color).toBe("var(--no)");
    expect(statusMeta("SUPERSEDED").label).toBe("Superseded");
    expect(statusMeta("ARCHIVED").label).toBe("Archived");
  });

  it("falls back to a humanized label for unknown statuses", () => {
    expect(statusMeta("SOME_STATE")).toEqual({
      label: "Some State",
      color: "var(--ink-dim)",
    });
  });
});

describe("provenanceMeta", () => {
  it("maps each change source to a badge", () => {
    expect(provenanceMeta("AI").short).toBe("AI");
    expect(provenanceMeta("PLAYER_SUGGESTION")).toEqual({
      short: "PLR",
      label: "Player suggestion",
      color: "var(--player)",
    });
    expect(provenanceMeta("IMPORT").short).toBe("IMP");
    expect(provenanceMeta("DM").short).toBe("DM");
  });

  it("defaults unknown sources to DM-authored", () => {
    expect(provenanceMeta("???")).toEqual({
      short: "DM",
      label: "DM-authored",
      color: "var(--ink-dim)",
    });
  });
});

describe("entityTypeColor", () => {
  it("assigns category colors across the type taxonomy", () => {
    expect(entityTypeColor("CRAWLER")).toBe("var(--accent)");
    expect(entityTypeColor("SYSTEM_AI")).toBe("var(--ai)");
    expect(entityTypeColor("BOSS")).toBe("var(--del)");
    expect(entityTypeColor("FLOOR")).toBe("var(--ok)");
    expect(entityTypeColor("FACTION")).toBe("var(--sys)");
    expect(entityTypeColor("ITEM")).toBe("var(--import)");
    expect(entityTypeColor("TITLE")).toBe("var(--player)");
    expect(entityTypeColor("NPC")).toBe("var(--ink-dim)");
  });
});
