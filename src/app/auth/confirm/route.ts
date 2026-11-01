import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { readConfirmParams } from "@/lib/confirm-params";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation";

/**
 * Landing point for the link in the confirmation email. Supports both the
 * token_hash template (works on any device) and the default PKCE code link.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const searchParams = readConfirmParams(request.nextUrl.searchParams);
  const next = safeNextPath(searchParams.get("next"), "/onboarding");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
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

  return NextResponse.redirect(new URL(ok ? next : "/login?error=confirm_failed", origin));
}
