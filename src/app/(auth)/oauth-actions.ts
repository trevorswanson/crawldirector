"use server";

import { signIn } from "@/server/auth";

export async function signInWithGitHub() {
  await signIn("github", { redirectTo: "/dashboard" });
}
