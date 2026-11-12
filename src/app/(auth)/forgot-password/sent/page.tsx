import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Page } from "@/components/page";

export const metadata: Metadata = { title: "Check your email" };

// The same page for every address, registered or not, so nobody can use it to
// find out who has an account.
export default function ForgotPasswordSentPage() {
  return (
    <Page narrow title="Check your email">
      <div className="flex items-start gap-4 rounded-xl border-2 border-primary bg-secondary p-5">
        <MailCheck aria-hidden className="mt-1 size-8 shrink-0 text-primary" />
        <div className="flex flex-col gap-3 text-lg">
          <p>If that email address has an account, we have sent a link to choose a new password.</p>
          <p>The link works once and expires after a short time.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-lg">
        <h2 className="text-2xl font-semibold">No email?</h2>
        <ul className="list-disc pl-6">
          <li>Wait a few minutes, then look in your spam or junk folder.</li>
          <li>Make sure you typed the address you signed up with.</li>
          <li>If you asked a minute ago, wait a minute before asking again.</li>
        </ul>
      </div>
      <p className="text-lg">
        <Link href="/forgot-password" className="font-semibold text-primary underline">
          Ask for another link
        </Link>
        {" · "}
        <Link href="/login" className="font-semibold text-primary underline">
          Back to sign in
        </Link>
      </p>
    </Page>
  );
}
