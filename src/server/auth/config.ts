import type { Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Provider } from "next-auth/providers";
import bcrypt from "bcryptjs";

import { prisma } from "@/server/db";
import { signInSchema } from "@/lib/validation";

// Pure auth building blocks, kept free of the `next-auth` entrypoint so they
// can be unit-tested without pulling in `next/server` (which the NextAuth()
// call transitively imports). `index.ts` wires these into NextAuth.

// Generic OIDC provider (provider id "oidc"). Works with any standards-
// compliant identity provider via discovery from AUTH_OIDC_ISSUER's
// .well-known/openid-configuration — e.g. a self-hosted Authentik, Keycloak,
// Auth0, etc. Enabled only when all three env vars are present.
export const oidcEnabled = Boolean(
  process.env.AUTH_OIDC_ISSUER &&
    process.env.AUTH_OIDC_ID &&
    process.env.AUTH_OIDC_SECRET,
);

export const oidcProvider: Provider = {
  id: "oidc",
  name: process.env.AUTH_OIDC_NAME ?? "SSO",
  type: "oidc",
  issuer: process.env.AUTH_OIDC_ISSUER,
  clientId: process.env.AUTH_OIDC_ID,
  clientSecret: process.env.AUTH_OIDC_SECRET,
};

// Validates credentials at the boundary and verifies the password hash.
// Returns the user identity on success, or null for any failure (Auth.js
// treats null as "invalid credentials" without leaking which check failed).
export async function authorizeCredentials(raw: unknown) {
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return { id: user.id, email: user.email, name: user.name };
}

// JWT strategy: persist the user id onto the token at sign-in so the session
// callback can expose it without a DB round-trip.
export function jwtCallback({ token, user }: { token: JWT; user?: User }) {
  if (user) token.id = user.id;
  return token;
}

export function sessionCallback({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}) {
  if (token.id) session.user.id = token.id as string;
  return session;
}
