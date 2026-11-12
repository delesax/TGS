import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/page";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot your password?" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { error } = await searchParams;

  return (
    <Page narrow title="Forgot your password?" intro="Enter the email address you signed up with. If it has an account, we will email you a link to choose a new password.">
      {error === "expired" ? (
        <p role="alert" className="rounded-lg border-2 border-destructive bg-[#fef3f2] p-4 text-lg text-destructive">
          That reset link has expired or has already been used. Each link works once and lasts a short time. Ask for a new one below.
        </p>
      ) : null}
      <ForgotPasswordForm />
      <p className="text-lg">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-primary underline">
          Back to sign in
        </Link>
      </p>
    </Page>
  );
}
