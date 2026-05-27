import { redirect } from "next/navigation";

import { auth } from "@/server/auth";

// Returns the signed-in user's id + profile, or null. Use in server components
// and actions; never trust client-supplied identity.
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

// For protected surfaces: returns the user or redirects to sign-in.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
