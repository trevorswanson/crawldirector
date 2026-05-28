import { describe, expect, it } from "vitest";

import {
  formatEntityType,
  formatTags,
  formatVisibility,
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
