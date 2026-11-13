import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteAccount, previewAccountDeletion } from "../../src/lib/account-deletion";

/**
 * The core of `npm run account:delete`. It calls the SAME deleteAccount() that
 * self-service deletion uses (src/lib/account-deletion.ts); nothing is copied.
 * Prints counts and the email that was passed in, no other personal data.
 */
export async function runDeleteAccount(opts: { admin: SupabaseClient; email: string; confirm: boolean; log: (line: string) => void }): Promise<number> {
  const { admin, log } = opts;
  const email = opts.email.trim().toLowerCase();

  let userId: string | null = null;
  for (let page = 1; !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      log("Could not look up accounts. Nothing was changed.");
      return 1;
    }
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    log(`No account with the email address ${email}. Nothing was changed.`);
    return 1;
  }

  const preview = await previewAccountDeletion(admin, userId);
  if (!preview.found) {
    log(`No profile for ${email}. Nothing was changed.`);
    return 1;
  }
  if (preview.alreadyDeleted) {
    log(`The account for ${email} is already anonymised. Nothing was changed.`);
    return 1;
  }

  log(`${opts.confirm ? "DELETING" : "DRY RUN (nothing will be changed)"}: account for ${email}`);
  log("Would be removed:");
  log("  - the email address and sign-in");
  log("  - the handle, name, expertise and bio");
  for (const [what, n] of Object.entries(preview.removed)) log(`  - ${n} ${what}`);
  log("Would stay, without a name:");
  log(`  - ${preview.kept.dispatches} Dispatch${preview.kept.dispatches === 1 ? "" : "es"}`);
  log(`  - ${preview.kept.positionsOnClosedCampaigns} position${preview.kept.positionsOnClosedCampaigns === 1 ? "" : "s"} on closed Campaigns, unlinked from the person`);
  log(`  - ${preview.kept.auditEntries} audit entr${preview.kept.auditEntries === 1 ? "y" : "ies"} (reference number only)`);

  if (!opts.confirm) {
    log("This was a dry run. Add --confirm to delete.");
    return 0;
  }

  const result = await deleteAccount(admin, userId, "by_hand");
  if (!result.ok) {
    log(result.reason === "not_found" ? "The account disappeared before it could be deleted." : "The deletion failed. Check the account before trying again.");
    return 1;
  }
  const s = result.summary;
  log("Deleted.");
  log(`  Dispatches kept: ${s.kept_dispatches ?? 0}; positions removed: ${s.removed_positions ?? 0}; positions kept unlinked: ${s.archived_positions ?? 0}; text copies scrubbed: ${s.text_copies_scrubbed ?? 0}`);
  if (!result.signInDeleted) log("WARNING: the profile is anonymised but the sign-in could not be deleted. Delete the user in the Supabase dashboard.");
  return 0;
}
