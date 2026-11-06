import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { DraftNotice, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireStrategist } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DeleteForm } from "./delete-form";

export const metadata: Metadata = { title: "Delete my account" };
export const dynamic = "force-dynamic";

// OWNER DECISION 8: every sentence on this page is DRAFT wording awaiting the
// owner's approval (UK GDPR), as is whether positions on closed Campaigns are kept.
export default async function DeleteAccountPage() {
  const viewer = await requireStrategist("/profile/delete");
  const supabase = await createClient();
  const [{ data: settings }, { count }] = await Promise.all([
    // Read on the server: browsers cannot select this column.
    createAdminClient().from("community_settings").select("account_deletion_enabled").single<{ account_deletion_enabled: boolean }>(),
    supabase.from("dispatches").select("id", { count: "exact", head: true }).eq("author_id", viewer.userId),
  ]);
  const enabled = Boolean(settings?.account_deletion_enabled);

  return (
    <Page title="Delete my account" narrow>
      <DraftNotice />
      {!enabled ? (
        <div className="flex flex-col gap-3">
          <p className="text-lg">
            Deleting your account is not switched on yet during this closed test. If you want your account deleted now, reply to your invitation email
            and we will do it by hand.
          </p>
          <Button asChild variant="outline" className="self-start">
            <Link href="/profile">Back to your account</Link>
          </Button>
        </div>
      ) : (
        <>
          <section aria-labelledby="first-h" className="flex flex-col gap-3">
            <h2 id="first-h" className="text-2xl font-bold">
              1. Download your data first
            </h2>
            <p className="text-lg">Once your account is deleted we cannot send you a copy.</p>
            <Button asChild variant="secondary" className="self-start">
              <a href="/profile/export" download>
                <Download aria-hidden /> Download my data
              </a>
            </Button>
          </section>
          <section aria-labelledby="what-h" className="flex flex-col gap-3">
            <h2 id="what-h" className="text-2xl font-bold">
              2. What happens
            </h2>
            <p className="text-lg font-semibold">Removed for good:</p>
            <ul className="list-disc pl-6 text-lg">
              <li>your email address and the ability to sign in, including passkeys</li>
              <li>your handle @{viewer.profile.handle}, name, expertise and bio</li>
              <li>your reactions, who and what you follow, and your email settings</li>
              <li>your positions on Campaigns that are still open</li>
            </ul>
            <p className="text-lg font-semibold">Kept, with no name attached:</p>
            <ul className="list-disc pl-6 text-lg">
              <li>
                your {count ?? 0} Dispatch{count === 1 ? "" : "es"}, shown as by “a deleted Strategist”, because Verdicts and the record of each debate
                depend on them
              </li>
              <li>your positions on closed Campaigns, kept without any link to you, for the record of how minds changed</li>
              <li>the audit record of what happened, kept for safety and accountability</li>
            </ul>
          </section>
          <section aria-labelledby="confirm-h" className="flex flex-col gap-3">
            <h2 id="confirm-h" className="text-2xl font-bold">
              3. Confirm
            </h2>
            <DeleteForm handle={viewer.profile.handle} />
            <Button asChild variant="outline">
              <Link href="/profile">Keep my account</Link>
            </Button>
          </section>
        </>
      )}
    </Page>
  );
}
