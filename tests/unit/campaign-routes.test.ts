import { describe, expect, it } from "vitest";

import {
  campaignHomeHref,
  campaignIdFromPathname,
} from "@/lib/campaign-routes";

describe("campaignHomeHref", () => {
  it("sends players to the crawler interface and everyone else to the DM console", () => {
    expect(campaignHomeHref("PLAYER", "c1")).toBe("/play/campaigns/c1");
    expect(campaignHomeHref("OWNER", "c1")).toBe("/campaigns/c1");
    expect(campaignHomeHref("CO_DM", "c1")).toBe("/campaigns/c1");
    expect(campaignHomeHref(null, "c1")).toBe("/campaigns/c1");
  });
});

describe("campaignIdFromPathname", () => {
  it("extracts the id from a DM-console path", () => {
    expect(campaignIdFromPathname("/campaigns/c1")).toBe("c1");
    expect(campaignIdFromPathname("/campaigns/c1/settings/crawlers")).toBe("c1");
  });

  it("returns null off the DM-console route", () => {
    expect(campaignIdFromPathname("/dashboard")).toBeNull();
    // The player route is a different shape and intentionally not matched here.
    expect(campaignIdFromPathname("/play/campaigns/c1")).toBeNull();
  });
});
