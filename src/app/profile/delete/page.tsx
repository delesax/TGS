import type { Metadata } from "next";
import { DraftNotice, Page } from "@/components/page";
import { requireStrategist } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DeleteForm } from "./delete-form";
import { DeletionOffContent, DeletionOnContent } from "./delete-content";

export const metadata: Metadata = { title: "Delete my account" };
export const dynamic = "force-dynamic";

// OWNER DECISION 8: the wording is in delete-content.tsx (docs/LEGAL_WORDING.md).
// Deletion stays OFF until the owner and the solicitor have signed off.
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
        <DeletionOffContent />
      ) : (
        <DeletionOnContent handle={viewer.profile.handle} count={count ?? 0} confirm={<DeleteForm handle={viewer.profile.handle} />} />
      )}
    </Page>
  );
}
