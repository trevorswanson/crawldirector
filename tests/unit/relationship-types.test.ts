import { describe, expect, it } from "vitest";

import {
  defaultRelationshipType,
  isDiscouragedRelationship,
  relationshipPickerOptions,
} from "@/lib/relationship-types";

// ADR 0008 §3: a crawler's floor is `Crawler.currentFloor`, not a LOCATED_ON
// edge, so crawler→FLOOR LOCATED_ON is retired from the create UI. The DB stays
// any-to-any (invariant #7); this is suggestion/picker suppression only.
describe("relationship-types — discouraged crawler→FLOOR LOCATED_ON (ADR 0008 §3)", () => {
  it("flags only crawler→FLOOR LOCATED_ON as discouraged", () => {
    expect(isDiscouragedRelationship("LOCATED_ON", "CRAWLER", "FLOOR")).toBe(true);
    // Non-crawler spatial uses stay legitimate.
    expect(isDiscouragedRelationship("LOCATED_ON", "BOSS", "FLOOR")).toBe(false);
    expect(isDiscouragedRelationship("LOCATED_ON", "NPC", "FLOOR")).toBe(false);
    // Other crawler→FLOOR edge types are untouched.
    expect(isDiscouragedRelationship("PART_OF", "CRAWLER", "FLOOR")).toBe(false);
    // A crawler→non-FLOOR LOCATED_ON is not the retired path.
    expect(isDiscouragedRelationship("LOCATED_ON", "CRAWLER", "LOCATION")).toBe(
      false,
    );
  });

  it("omits LOCATED_ON from a crawler→FLOOR picker entirely (not even 'Show all')", () => {
    const options = relationshipPickerOptions("CRAWLER", "FLOOR");
    const allOffered = [
      ...options.suggested,
      ...options.categories.flatMap((category) => category.types),
    ];
    expect(allOffered).not.toContain("LOCATED_ON");
    // The pairing still offers sensible spatial edges (PART_OF crawler→floor is
    // odd but allowed; the point is the picker isn't emptied).
    expect(allOffered.length).toBeGreaterThan(0);
  });

  it("still offers LOCATED_ON for a non-crawler→FLOOR pairing", () => {
    const options = relationshipPickerOptions("BOSS", "FLOOR");
    const allOffered = [
      ...options.suggested,
      ...options.categories.flatMap((category) => category.types),
    ];
    expect(allOffered).toContain("LOCATED_ON");
    // BOSS→FLOOR names LOCATED_ON explicitly, so it surfaces as suggested.
    expect(options.suggested).toContain("LOCATED_ON");
  });

  it("never defaults a crawler→FLOOR pairing to LOCATED_ON", () => {
    expect(defaultRelationshipType("CRAWLER", "FLOOR")).not.toBe("LOCATED_ON");
  });

  it("keeps a discouraged current type selectable for the edit form via `keep`", () => {
    // The create path hides crawler→FLOOR LOCATED_ON...
    const create = relationshipPickerOptions("CRAWLER", "FLOOR");
    expect(
      create.categories.flatMap((category) => category.types),
    ).not.toContain("LOCATED_ON");

    // ...but editing a service-created edge of that type must keep it offered,
    // so an unrelated edit can't silently rewrite the relationship type.
    const edit = relationshipPickerOptions("CRAWLER", "FLOOR", {
      keep: "LOCATED_ON",
    });
    expect(
      edit.categories.flatMap((category) => category.types),
    ).toContain("LOCATED_ON");
  });
});
