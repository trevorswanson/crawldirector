"use server";

import { signIn } from "@/server/auth";

export async function signInWithOidc() {
  await signIn("oidc", { redirectTo: "/dashboard" });
}
