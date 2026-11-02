import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Page } from "@/components/page";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <Page narrow title="Check your email">
      <div className="flex items-start gap-4 rounded-xl border-2 border-primary bg-secondary p-5">
        <MailCheck aria-hidden className="mt-1 size-8 shrink-0 text-primary" />
        <div className="flex flex-col gap-3 text-lg">
          <p>We have sent you an email with a link to confirm your address.</p>
          <p>Open the email and click the link. You will come back here to choose your handle.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-lg">
        <h2 className="text-2xl font-semibold">No email?</h2>
        <ul className="list-disc pl-6">
          <li>Wait a few minutes, then look in your spam or junk folder.</li>
          <li>Make sure you typed your email address correctly.</li>
        </ul>
      </div>
      <p className="text-lg">
        Already confirmed?{" "}
        <Link href="/login" className="font-semibold text-primary underline">
          Sign in
        </Link>
      </p>
    </Page>
  );
}
