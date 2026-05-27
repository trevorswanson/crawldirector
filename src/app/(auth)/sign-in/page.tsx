import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { signInAction } from "@/app/(auth)/actions";
import { signInWithOidc } from "@/app/(auth)/oauth-actions";
import { oidcEnabled } from "@/server/auth";

export default function SignInPage() {
  const oidcName = process.env.AUTH_OIDC_NAME ?? "SSO";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Welcome back, Crawler. Sign in to run your campaign.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CredentialsForm mode="sign-in" action={signInAction} />
        {oidcEnabled && (
          <form action={signInWithOidc}>
            <Button type="submit" variant="outline" className="w-full">
              Continue with {oidcName}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-sm text-[var(--muted-foreground)]">
          No account?{" "}
          <Link href="/sign-up" className="text-[var(--primary)] underline">
            Create one
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
