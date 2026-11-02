import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/page";
import { parseUnsubscribe, type UnsubscribeKind } from "@/lib/email/unsubscribe";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

const WHAT: Record<UnsubscribeKind, string> = {
  replies: "emails when someone replies to your Dispatches",
  campaign_updates: "emails about Campaigns you follow",
  closing_soon: "reminders before a Campaign you are in closes",
  all: "all emails from The Grand Strategist",
};

// The link opens this page and one button press confirms, so link checkers in
// mail apps cannot unsubscribe people by accident. Mail apps that support
// one-click unsubscribe use /api/email/unsubscribe directly.
export default async function UnsubscribePage({ searchParams }: PageProps<"/email/unsubscribe">) {
  const params = await searchParams;
  const parsed = parseUnsubscribe(params.token, params.kind);

  return (
    <Page title="Unsubscribe" narrow>
      {parsed ? (
        <>
          <p className="text-xl">Stop {WHAT[parsed.kind]}?</p>
          <UnsubscribeForm token={parsed.token} kind={parsed.kind} label={`Stop ${parsed.kind === "all" ? "all emails" : "these emails"}`} />
          {parsed.kind !== "all" ? <UnsubscribeForm token={parsed.token} kind="all" label="Stop all emails instead" /> : null}
        </>
      ) : (
        <p className="text-xl">This unsubscribe link is not complete. Use the link from the email, or sign in and open Email settings.</p>
      )}
      <p className="text-lg">
        You can also choose which emails you get in{" "}
        <Link href="/profile/email" className="font-semibold text-primary underline">
          Email settings
        </Link>{" "}
        when signed in.
      </p>
    </Page>
  );
}
