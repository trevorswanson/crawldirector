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
import { signUpAction } from "@/app/(auth)/actions";
import { signInWithOidc } from "@/app/(auth)/oauth-actions";
import { oidcEnabled } from "@/server/auth";

export default function SignUpPage() {
  const oidcName = process.env.AUTH_OIDC_NAME ?? "SSO";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Start modeling your Dungeon Crawler Carl campaign.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CredentialsForm mode="sign-up" action={signUpAction} />
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
          Already have an account?{" "}
          <Link href="/sign-in" className="text-[var(--primary)] underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
