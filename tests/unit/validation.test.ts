import { describe, expect, it } from "vitest";

import {
  createCampaignSchema,
  signUpSchema,
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

describe("createCampaignSchema", () => {
  it("requires a name", () => {
    expect(createCampaignSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ name: "World" }).success).toBe(true);
  });
});
