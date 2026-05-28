import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/server/db";
import {
  authorizeCredentials,
  jwtCallback,
  oidcEnabled,
  oidcProvider,
  sessionCallback,
} from "@/server/auth/config";

export { oidcEnabled } from "@/server/auth/config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

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
      authorize: authorizeCredentials,
    }),
    ...(oidcEnabled ? [oidcProvider] : []),
  ],
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
});
