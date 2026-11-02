"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getViewer } from "@/lib/auth";
import { authenticationOptions, registrationOptions, verifyAndSaveRegistration, verifyAuthentication } from "@/lib/passkeys";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation";

const CHALLENGE_COOKIE = "tgs_passkey_challenge";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 300 };

type Result<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

export async function beginPasskeyRegistration(): Promise<Result<PublicKeyCredentialCreationOptionsJSON>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Please sign in again, then add your passkey." };

  const { options, challengeId } = await registrationOptions({
    id: viewer.userId,
    email: viewer.email,
    handle: viewer.profile?.handle ?? null,
  });
  (await cookies()).set(CHALLENGE_COOKIE, challengeId, cookieOptions);
  return { ok: true, data: options };
}

export async function finishPasskeyRegistration(response: RegistrationResponseJSON, nickname: string): Promise<Result> {
  const viewer = await getViewer();
  const jar = await cookies();
  const challengeId = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!viewer || !challengeId) return { ok: false, message: "That took too long. Please try adding your passkey again." };

  try {
    const saved = await verifyAndSaveRegistration(viewer.userId, challengeId, response, nickname.trim().slice(0, 60));
    if (!saved) return { ok: false, message: "We could not save that passkey. Please try again." };
  } catch {
    return { ok: false, message: "We could not save that passkey. Please try again." };
  }
  revalidatePath("/profile");
  return { ok: true, data: undefined };
}

export async function beginPasskeySignIn(): Promise<Result<PublicKeyCredentialRequestOptionsJSON>> {
  const { options, challengeId } = await authenticationOptions();
  (await cookies()).set(CHALLENGE_COOKIE, challengeId, cookieOptions);
  return { ok: true, data: options };
}

export async function finishPasskeySignIn(response: AuthenticationResponseJSON, next: string): Promise<Result<string>> {
  const jar = await cookies();
  const challengeId = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  const failed = {
    ok: false as const,
    message: "We did not recognise that passkey. Try again, or sign in with your email and password.",
  };
  if (!challengeId) return failed;

  const userId = await verifyAuthentication(challengeId, response);
  if (!userId) return failed;

  // Start a normal Supabase session for this user. generateLink does not send
  // an email; we exchange its one-time token on the server straight away.
  const admin = createAdminClient();
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const email = userData.user?.email;
  if (!email) return failed;

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link.properties?.hashed_token) return failed;

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) return failed;

  return { ok: true, data: safeNextPath(next) };
}

export async function removePasskey(passkeyId: string): Promise<Result> {
  const supabase = await createClient();
  // Row-level security limits this to the signed-in user's own passkeys.
  const { error, count } = await supabase.from("passkeys").delete({ count: "exact" }).eq("id", passkeyId);
  if (error || !count) return { ok: false, message: "We could not remove that passkey. Please refresh the page and try again." };
  revalidatePath("/profile");
  return { ok: true, data: undefined };
}
