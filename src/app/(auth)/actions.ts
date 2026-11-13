"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { publicEnv } from "@/lib/env";
import { LEGAL } from "@/lib/legal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "@/lib/recovery";
import { fieldErrors, forgotPasswordSchema, resetPasswordSchema, safeNextPath, signInSchema, signUpSchema } from "@/lib/validation";

const INVITE_PROBLEM =
  "We could not accept that invite code. It may be mistyped, used up or expired. Check the code in your invitation email, or ask the person who invited you for a new one.";

/**
 * Server-side check so we can give a clear message. Counts places held by
 * unconfirmed sign-ups from the last 24 hours. The database trigger enforces it again.
 */
async function inviteIsUsable(code: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("invite_is_usable", { p_code: code });
  return !error && data === true;
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    inviteCode: formData.get("inviteCode"),
    ageConfirmed: formData.get("ageConfirmed") === "on",
    publicAcknowledged: formData.get("publicAcknowledged") === "on",
    termsAccepted: formData.get("termsAccepted") === "on",
  });
  if (!parsed.success) {
    return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  }
  const { email, password, inviteCode } = parsed.data;

  if (!(await inviteIsUsable(inviteCode))) {
    return { formError: "Your invite code was not accepted.", fieldErrors: { inviteCode: INVITE_PROBLEM } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/onboarding`,
      // The database trigger refuses the account without all three consents,
      // and records the versions agreed to.
      data: {
        invite_code: inviteCode,
        age_confirmed: true,
        public_acknowledged: true,
        terms_accepted: true,
        terms_version: LEGAL.termsVersion,
        privacy_version: LEGAL.privacyVersion,
      },
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return {
        formError: "Please choose a stronger password.",
        fieldErrors: { password: "Use at least 10 characters. A short phrase of three or four words works well." },
      };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return {
        formError: "Too many sign-up attempts just now.",
        formHint: "Please wait an hour and try again. Your answers are still filled in.",
      };
    }
    if (error.code === "unexpected_failure" || error.message.includes("Database error")) {
      // The invite trigger refused the account (for example, the code was used up a moment ago).
      return { formError: "Your invite code was not accepted.", fieldErrors: { inviteCode: INVITE_PROBLEM } };
    }
    console.error("signUp failed", error.code, error.status);
    return {
      formError: "We could not create your account.",
      formHint: "Please try again in a few minutes. If it keeps happening, reply to your invitation email.",
    };
  }

  // Email confirmation switched off: the person is already signed in.
  if (data.session) redirect("/onboarding");

  // Same page whether or not the email was already registered, so nobody can test which emails have accounts.
  redirect("/signup/check-email");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        formError: "Please confirm your email address first.",
        formHint: "We sent you an email with a link when you signed up. Click the link, then sign in here.",
      };
    }
    if (error.status === 429) {
      return { formError: "Too many sign-in attempts.", formHint: "Please wait a few minutes and try again." };
    }
    return {
      formError: "That email and password do not match our records.",
      formHint: "Check both and try again. Passwords are case-sensitive. If you added a passkey, you can use that instead.",
    };
  }

  redirect(safeNextPath(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * Sends the reset email. The person always lands on the same page whether or
 * not the address has an account, and every failure from Supabase (including its
 * own rate limit, which could otherwise hint that an account exists) is logged
 * and answered the same way, so nobody can test which emails are registered.
 */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/reset-password`,
  });
  if (error) console.error("resetPasswordForEmail failed", error.code, error.status);

  redirect("/forgot-password/sent");
}

/**
 * Sets the new password. Only works in the recovery session that /auth/confirm
 * opens from the email link (a signed-in session plus the short-lived recovery
 * cookie), so an ordinary signed-in session cannot change a password this way.
 * Afterwards every session is ended and the person signs in with the new password.
 */
export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  }

  const jar = await cookies();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !jar.get(RECOVERY_COOKIE)) redirect("/forgot-password?error=expired");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password") {
      return {
        formError: "Please choose a stronger password.",
        fieldErrors: { password: "Use at least 10 characters. A short phrase of three or four words works well." },
      };
    }
    if (error.code === "same_password") {
      return { formError: "Please choose a different password.", formHint: "Your new password must not be the same as your current one." };
    }
    if (error.status === 401 || error.status === 403 || error.code === "session_not_found") redirect("/forgot-password?error=expired");
    console.error("resetPassword failed", error.code, error.status);
    return { formError: "We could not change your password.", formHint: "Please try again in a few minutes, or ask for a new link." };
  }

  jar.delete(RECOVERY_COOKIE);
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?reset=success");
}
