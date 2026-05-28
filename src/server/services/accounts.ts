import bcrypt from "bcryptjs";

import { prisma } from "@/server/db";
import { ServiceError } from "@/lib/errors";
import { signUpSchema, type SignUpInput } from "@/lib/validation";

const SALT_ROUNDS = 12;

// Creates a credentials-based user. OAuth users are created by the Auth.js
// adapter instead. Validates at the boundary and refuses duplicate emails.
export async function registerUser(input: SignUpInput) {
  const { name, email, password } = signUpSchema.parse(input);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ServiceError("An account with that email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: { id: true, email: true, name: true },
  });
  return user;
}
