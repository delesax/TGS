import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const RP_NAME = "The Grand Strategist";

function relyingParty() {
  const site = new URL(publicEnv().NEXT_PUBLIC_SITE_URL);
  return { rpID: site.hostname, origin: site.origin };
}

async function saveChallenge(kind: "register" | "login", challenge: string, userId: string | null): Promise<string> {
  const admin = createAdminClient();
  // Housekeeping: drop expired challenges so the table stays small.
  await admin.from("webauthn_challenges").delete().lt("expires_at", new Date().toISOString());
  const { data, error } = await admin
    .from("webauthn_challenges")
    .insert({ kind, challenge, user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(`Could not store passkey challenge: ${error.message}`);
  return data.id as string;
}

/** Fetches and deletes a challenge so it can be used only once. */
async function takeChallenge(id: string, kind: "register" | "login", userId: string | null): Promise<string | null> {
  const admin = createAdminClient();
  let query = admin.from("webauthn_challenges").delete().eq("id", id).eq("kind", kind).gt("expires_at", new Date().toISOString());
  query = userId ? query.eq("user_id", userId) : query.is("user_id", null);
  const { data } = await query.select("challenge").maybeSingle();
  return (data?.challenge as string | undefined) ?? null;
}

export async function registrationOptions(user: { id: string; email: string; handle: string | null }): Promise<{
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeId: string;
}> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("passkeys").select("credential_id, transports").eq("user_id", user.id);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: relyingParty().rpID,
    userName: user.email,
    userDisplayName: user.handle ? `@${user.handle}` : user.email,
    userID: isoUint8Array.fromUTF8String(user.id),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((p) => ({
      id: p.credential_id as string,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });

  const challengeId = await saveChallenge("register", options.challenge, user.id);
  return { options, challengeId };
}

export async function verifyAndSaveRegistration(
  userId: string,
  challengeId: string,
  response: RegistrationResponseJSON,
  nickname: string,
): Promise<boolean> {
  const expectedChallenge = await takeChallenge(challengeId, "register", userId);
  if (!expectedChallenge) return false;

  const { rpID, origin } = relyingParty();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  if (!verification.verified) return false;

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const admin = createAdminClient();
  const { error } = await admin.from("passkeys").insert({
    user_id: userId,
    credential_id: credential.id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    nickname: nickname || null,
  });
  if (error) return false;

  await admin.from("audit_log").insert({
    actor_id: userId,
    action: "passkey.added",
    target_table: "passkeys",
    target_id: credential.id,
  });
  return true;
}

export async function authenticationOptions(): Promise<{
  options: PublicKeyCredentialRequestOptionsJSON;
  challengeId: string;
}> {
  // No allowCredentials: the browser offers any passkey saved for this site.
  const options = await generateAuthenticationOptions({ rpID: relyingParty().rpID, userVerification: "preferred" });
  const challengeId = await saveChallenge("login", options.challenge, null);
  return { options, challengeId };
}

/** Verifies a passkey sign-in and returns the user's id, or null. */
export async function verifyAuthentication(challengeId: string, response: AuthenticationResponseJSON): Promise<string | null> {
  const expectedChallenge = await takeChallenge(challengeId, "login", null);
  if (!expectedChallenge) return null;

  const admin = createAdminClient();
  const { data: passkey } = await admin
    .from("passkeys")
    .select("id, user_id, credential_id, public_key, counter, transports")
    .eq("credential_id", response.id)
    .maybeSingle();
  if (!passkey) return null;

  const { rpID, origin } = relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credential_id as string,
        publicKey: isoBase64URL.toBuffer(passkey.public_key as string),
        counter: Number(passkey.counter),
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch {
    return null;
  }
  if (!verification.verified) return null;

  await admin
    .from("passkeys")
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", passkey.id);

  return passkey.user_id as string;
}
