import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Has this person agreed to us recording their Campaign positions?
 * The consent columns are not readable from the browser, so this reads them
 * on the server (service role), only ever for the signed-in viewer's own id.
 */
export async function hasPositionsConsent(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("profiles").select("positions_consent_at").eq("id", userId).maybeSingle<{ positions_consent_at: string | null }>();
  return Boolean(data?.positions_consent_at);
}
