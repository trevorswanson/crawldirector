import NextAuth, { type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";

import { prisma } from "@/server/db";
import { signInSchema } from "@/lib/validation";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

// Generic OIDC provider (provider id "oidc"). Works with any standards-
// compliant identity provider via discovery from AUTH_OIDC_ISSUER's
// .well-known/openid-configuration — e.g. a self-hosted Authentik, Keycloak,
// Auth0, etc. Enabled only when all three env vars are present.
export const oidcEnabled = Boolean(
  process.env.AUTH_OIDC_ISSUER &&
    process.env.AUTH_OIDC_ID &&
    process.env.AUTH_OIDC_SECRET,
);

const oidcProvider: Provider = {
  id: "oidc",
  name: process.env.AUTH_OIDC_NAME ?? "SSO",
  type: "oidc",
  issuer: process.env.AUTH_OIDC_ISSUER,
  clientId: process.env.AUTH_OIDC_ID,
  clientSecret: process.env.AUTH_OIDC_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Credentials provider requires the JWT session strategy; the Prisma adapter
  // still persists users and linked OAuth accounts. See docs/adr/0001.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    ...(oidcEnabled ? [oidcProvider] : []),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) token.id = user.id;
      return token;
    },
    session: ({ session, token }) => {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
