import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const UNSUBSCRIBE_KINDS = ["replies", "campaign_updates", "closing_soon", "all"] as const;
export type UnsubscribeKind = (typeof UNSUBSCRIBE_KINDS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUnsubscribe(token: unknown, kind: unknown): { token: string; kind: UnsubscribeKind } | null {
  if (typeof token !== "string" || !UUID.test(token)) return null;
  const k = (UNSUBSCRIBE_KINDS as readonly string[]).includes(String(kind)) ? (kind as UnsubscribeKind) : "all";
  return { token, kind: k };
}

/** True when the token matched an account. Works without signing in: the token is the proof. */
export async function unsubscribe(token: string, kind: UnsubscribeKind): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("unsubscribe_by_token", { p_token: token, p_kind: kind });
  if (error) throw new Error("Could not unsubscribe");
  return data === true;
}
