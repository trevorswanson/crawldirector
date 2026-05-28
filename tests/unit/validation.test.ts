import { describe, expect, it } from "vitest";

import {
  createCampaignSchema,
  createCrawlerSchema,
  createGenericEntitySchema,
  signInSchema,
  signUpSchema,
  updateEntitySchema,
} from "@/lib/validation";

describe("signUpSchema", () => {
  it("accepts a valid sign-up", () => {
    const r = signUpSchema.safeParse({
      name: "Carl",
      email: "carl@example.com",
      password: "hunter2hunter2",
    });
    expect(r.success).toBe(true);
  });

  it("rejects short passwords", () => {
    const r = signUpSchema.safeParse({
      name: "Carl",
      email: "carl@example.com",
      password: "short",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed emails", () => {
    const r = signUpSchema.safeParse({
      name: "Carl",
      email: "not-an-email",
      password: "hunter2hunter2",
    });
    expect(r.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepts a valid sign-in", () => {
    const r = signInSchema.safeParse({
      email: "carl@example.com",
      password: "anything",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const r = signInSchema.safeParse({
      email: "carl@example.com",
      password: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const r = signInSchema.safeParse({ email: "nope", password: "x" });
    expect(r.success).toBe(false);
  });
});

describe("createCampaignSchema", () => {
  it("requires a name", () => {
    expect(createCampaignSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ name: "World" }).success).toBe(true);
  });

  it("accepts an optional summary and an empty-string summary", () => {
    expect(
      createCampaignSchema.safeParse({ name: "World", summary: "A place" })
        .success,
    ).toBe(true);
    expect(
      createCampaignSchema.safeParse({ name: "World", summary: "" }).success,
    ).toBe(true);
  });

  it("rejects an over-long summary", () => {
    const r = createCampaignSchema.safeParse({
      name: "World",
      summary: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});

describe("entity schemas", () => {
  it("normalizes tags and accepts generic entity types", () => {
    const parsed = createGenericEntitySchema.parse({
      type: "FACTION",
      name: "  Skull Empire  ",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: "war, sponsor, war",
    });
    expect(parsed.name).toBe("Skull Empire");
    expect(parsed.tags).toEqual(["war", "sponsor", "war"]);
  });

  it("accepts already-normalized tag arrays from service callers", () => {
    const parsed = createGenericEntitySchema.parse({
      type: "NPC",
      name: "Zev",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [" admin ", ""],
    });
    expect(parsed.tags).toEqual(["admin"]);
  });

  it("rejects CRAWLER in the generic entity schema", () => {
    expect(
      createGenericEntitySchema.safeParse({
        type: "CRAWLER",
        name: "Carl",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: "",
      }).success,
    ).toBe(false);
  });

  it("coerces crawler numeric fields from form values", () => {
    const parsed = createCrawlerSchema.parse({
      name: "Carl",
      summary: "",
      description: "",
      visibility: "PLAYER_FACING",
      tags: "",
      level: "2",
      hp: "30",
      mp: "",
      gold: "10",
      fanCount: "500",
      killCount: "3",
      currentFloor: "1",
      isAlive: "true",
    });
    expect(parsed.level).toBe(2);
    expect(parsed.mp).toBeUndefined();
    expect(parsed.fanCount).toBe(500);
  });

  it("keeps update type immutable by requiring the submitted type", () => {
    expect(
      updateEntitySchema.safeParse({
        type: "NPC",
        name: "Zev",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: "",
      }).success,
    ).toBe(true);
    expect(
      updateEntitySchema.safeParse({
        name: "Zev",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: "",
      }).success,
    ).toBe(false);
  });
});
