import { describe, expect, it } from "vitest";

import {
  formatInputValue,
  formatReviewValue,
  reviewInputKind,
} from "@/lib/review";

describe("review diff helpers", () => {
  it("formats object arrays and null input values for round-tripping", () => {
    const participants = [{ entityId: "e1", role: "ACTOR" }];

    expect(reviewInputKind(participants)).toBe("json");
    expect(formatReviewValue(participants)).toBe(JSON.stringify(participants));
    expect(formatInputValue(null, "string")).toBe("");
  });
});
