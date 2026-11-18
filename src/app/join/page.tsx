import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Page } from "@/components/page";
import { getViewer } from "@/lib/auth";
import { joinFormEnabled } from "@/lib/join-form";
import { JoinForm } from "./join-form";

// Not linked from anywhere and not indexed: the owner decided it is not advertised until after the first wave.
export const metadata: Metadata = { title: "Ask to join", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function JoinPage() {
  if (!joinFormEnabled()) {
    return (
      <Page narrow title="Not open yet" intro="Requests to join are not open yet. There is nothing to fill in on this page." />
    );
  }
  if (await getViewer()) redirect("/dossier");
  return (
    <Page
      narrow
      title="Ask to join"
      intro="The Grand Strategist is invite-only during the pilot. Leave your email address and we may invite you. We do not send a confirmation. If we can offer you a place, you will get an email with a link that works for that address only."
    >
      <JoinForm />
      <p className="text-base text-muted-foreground">
        We use your email address only to answer this request. See our{" "}
        <Link href="/privacy" className="font-semibold text-primary underline">
          privacy policy
        </Link>
        .
      </p>
      <p className="text-lg">
        Already have an invite?{" "}
        <Link href="/signup" className="font-semibold text-primary underline">
          Create your account
        </Link>
      </p>
    </Page>
  );
}
