import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "@/components/page";
import { getViewer } from "@/lib/auth";
import { safeNextPath } from "@/lib/validation";
import { PasskeySignIn } from "./passkey-sign-in";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const CONFIRM_ERRORS: Record<string, string> = {
  confirm_failed: "That confirmation link did not work. It may have expired or already been used, or your invite may have filled up while you were away. Try signing in; if that fails, sign up again with your invite code.",
};

export default async function SignInPage({ searchParams }: PageProps<"/login">) {
  const { next, error, reset } = await searchParams;
  const nextPath = safeNextPath(next);
  if (await getViewer()) redirect(nextPath);

  return (
    <Page narrow title="Sign in" intro="Welcome back. Sign in with your email and password, or with a passkey.">
      {typeof error === "string" && CONFIRM_ERRORS[error] ? (
        <p role="alert" className="rounded-lg border-2 border-destructive bg-[#fef3f2] p-4 text-lg text-destructive">
          {CONFIRM_ERRORS[error]}
        </p>
      ) : null}
      {reset === "success" ? (
        <p role="status" className="rounded-lg border-2 border-primary bg-secondary p-4 text-lg">
          Your password has been changed. Sign in with your new password.
        </p>
      ) : null}
      <SignInForm next={nextPath} />
      <p className="text-lg">
        <Link href="/forgot-password" className="font-semibold text-primary underline">
          Forgot your password?
        </Link>
      </p>
      <div className="flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="text-lg text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <PasskeySignIn next={nextPath} />
      <p className="text-lg">
        New here and have an invite code?{" "}
        <Link href="/signup" className="font-semibold text-primary underline">
          Create your account
        </Link>
      </p>
    </Page>
  );
}
