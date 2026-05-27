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
import { signInWithGitHub } from "@/app/(auth)/oauth-actions";

export default function SignUpPage() {
  const githubEnabled = Boolean(
    process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
  );

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
        {githubEnabled && (
          <form action={signInWithGitHub}>
            <Button type="submit" variant="outline" className="w-full">
              Continue with GitHub
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
