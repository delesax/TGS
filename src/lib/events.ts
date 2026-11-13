import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Records one line in our own incident log (table system_events, kept 30 days).
 * Kind and code are short fixed words; detail is counts only: never a name,
 * address, IP or text. Never throws: logging must not break the request.
 */
export async function logEvent(kind: string, code: string, detail: Record<string, string | number | boolean> = {}): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("log_system_event", { p_kind: kind, p_code: code, p_detail: detail });
    if (error) console.error("log_system_event failed", error.code);
  } catch (e) {
    console.error("log_system_event failed", e instanceof Error ? e.message.slice(0, 120) : "unknown");
  }
}
