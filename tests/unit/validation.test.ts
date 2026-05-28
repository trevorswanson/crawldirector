import { describe, expect, it } from "vitest";

import {
  createCampaignSchema,
  signInSchema,
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
