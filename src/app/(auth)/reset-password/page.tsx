import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Page } from "@/components/page";
import { RECOVERY_COOKIE } from "@/lib/recovery";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const recovering = Boolean(user) && Boolean((await cookies()).get(RECOVERY_COOKIE));

  if (!recovering) {
    return (
      <Page narrow title="This link has expired">
        <p role="alert" className="rounded-lg border-2 border-destructive bg-[#fef3f2] p-4 text-lg text-destructive">
          This password reset link has expired or has already been used. Each link works once and lasts a short time.
        </p>
        <p className="text-lg">
          <Link href="/forgot-password" className="font-semibold text-primary underline">
            Ask for a new reset link
          </Link>
        </p>
      </Page>
    );
  }

  return (
    <Page narrow title="Choose a new password" intro="Choose a password you have not used before. When you save it, you will be signed out everywhere and asked to sign in again.">
      <ResetPasswordForm />
    </Page>
  );
}
