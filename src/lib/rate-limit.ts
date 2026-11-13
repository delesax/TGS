import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { logEvent } from "@/lib/events";
import { LIMITS, type Bucket } from "@/lib/rate-limit-config";
import { createAdminClient } from "@/lib/supabase/admin";

/** SHA-256 of a value, so the limiter never stores a raw IP or email address. */
export function hashSubject(value: string): string {
  return createHash("sha256").update(`tgs-rate:${value.toLowerCase()}`).digest("hex").slice(0, 40);
}

/** The caller's IP, hashed. Vercel puts the real client address first in x-forwarded-for. */
export async function ipSubject(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return hashSubject(ip);
}

/**
 * Counts one hit and says whether the caller is still within the limit.
 * If the limiter itself fails, the request is allowed (and the failure is
 * logged): a broken counter must never lock real members out.
 */
export async function withinLimit(bucket: Bucket, subject: string): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[bucket];
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", { p_bucket: bucket, p_subject: subject, p_max: max, p_window_seconds: windowSeconds });
    if (error) {
      console.error("rate_limit_hit failed", error.code);
      return true;
    }
    if (data === false) {
      void logEvent("rate_limited", bucket);
      return false;
    }
    return true;
  } catch (e) {
    console.error("rate_limit_hit failed", e instanceof Error ? e.message.slice(0, 120) : "unknown");
    return true;
  }
}
