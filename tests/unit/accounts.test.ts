import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

import { prisma } from "@/server/db";
import { ServiceError } from "@/lib/errors";
import { registerUser } from "@/server/services/accounts";

// Real-DB integration tests for the account service. See campaigns.test.ts for
// the database setup expectations.
beforeEach(async () => {
  await prisma.membership.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const input = {
  name: "Carl",
  email: "carl@example.com",
  password: "hunter2hunter2",
};

describe("registerUser", () => {
  it("creates a user and stores a verifiable bcrypt hash (not the plaintext)", async () => {
    const user = await registerUser(input);

    expect(user).toEqual({
      id: expect.any(String),
      email: input.email,
      name: input.name,
    });

    const stored = await prisma.user.findUnique({
      where: { email: input.email },
      select: { passwordHash: true },
    });
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toBe(input.password);
    expect(await bcrypt.compare(input.password, stored!.passwordHash!)).toBe(true);
  });

  it("refuses a duplicate email with a ServiceError", async () => {
    await registerUser(input);
    await expect(registerUser(input)).rejects.toBeInstanceOf(ServiceError);

    // Only the original user exists.
    expect(await prisma.user.count({ where: { email: input.email } })).toBe(1);
  });

  it("validates input at the boundary", async () => {
    await expect(
      registerUser({ name: "", email: "bad", password: "x" }),
    ).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
  });
});
