import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { readConfirmParams } from "@/lib/confirm-params";
import { isRecoveryLink, RECOVERY_COOKIE, RECOVERY_MAX_AGE_SECONDS, RESET_PATH } from "@/lib/recovery";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation";

/**
 * Landing point for the link in the confirmation and password reset emails.
 * Supports both the token_hash template (works on any device) and the default
 * PKCE code link. A reset link ends on /reset-password with a short-lived
 * recovery cookie; one that fails goes back to /forgot-password with a clear message.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const searchParams = readConfirmParams(request.nextUrl.searchParams);
  const type = searchParams.get("type") as EmailOtpType | null;
  const recovery = isRecoveryLink(type, searchParams.get("next") ?? null);
  const next = recovery ? RESET_PATH : safeNextPath(searchParams.get("next"), "/onboarding");
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (recovery) {
    if (!ok) return NextResponse.redirect(new URL("/forgot-password?error=expired", origin));
    (await cookies()).set(RECOVERY_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: publicEnv().NEXT_PUBLIC_SITE_URL.startsWith("https://"),
      path: "/",
      maxAge: RECOVERY_MAX_AGE_SECONDS,
    });
    return NextResponse.redirect(new URL(RESET_PATH, origin));
  }

  return NextResponse.redirect(new URL(ok ? next : "/login?error=confirm_failed", origin));
}
