"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/server/auth";
import { registerUser } from "@/server/services/accounts";
import { ServiceError } from "@/lib/errors";
import { signInSchema, signUpSchema } from "@/lib/validation";

export type ActionState = { error?: string } | undefined;

// next's redirect()/signIn-with-redirectTo throws a control-flow error we must
// rethrow rather than treat as a failure. Detect it by its digest.
function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await registerUser(parsed.data);
    // Sign the new user straight in, then land on the dashboard.
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Could not create your account. Please try again." };
  }
  return undefined;
}

export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    return { error: "Could not sign you in. Please try again." };
  }
  return undefined;
}
