import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireStrategist } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmailForm, type EmailPrefs } from "./email-form";

export const metadata: Metadata = { title: "Email settings" };
export const dynamic = "force-dynamic";

const DEFAULTS: EmailPrefs = { replies: true, campaign_updates: true, closing_soon: true, moderation: true, unsubscribed_all_at: null };

export default async function EmailSettingsPage() {
  const viewer = await requireStrategist("/profile/email");
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("replies, campaign_updates, closing_soon, moderation, unsubscribed_all_at")
    .eq("user_id", viewer.userId)
    .maybeSingle<EmailPrefs>();

  return (
    <Page
      title="Email settings"
      intro={<>We email {viewer.email} only about things you have chosen below. Every email has a link to stop it. We never send marketing.</>}
      narrow
    >
      <Button asChild variant="outline" className="self-start">
        <Link href="/profile">
          <ArrowLeft aria-hidden /> Back to your account
        </Link>
      </Button>
      <EmailForm prefs={data ?? DEFAULTS} />
    </Page>
  );
}
