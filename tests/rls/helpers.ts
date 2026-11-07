import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadTestEnv } from "../test-env";

export const env = loadTestEnv();

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const service = createClient(env.supabaseUrl, env.serviceKey, noSession);

export function anonClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.anonKey, noSession);
}

export async function createInvite(overrides: Record<string, unknown> = {}): Promise<{ id: string; code: string }> {
  const code = `TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await service
    .from("invites")
    .insert({ code, max_uses: 1, note: "rls test", ...overrides })
    .select("id, code")
    .single();
  if (error) throw error;
  return data;
}

export type TestUser = { id: string; email: string; client: SupabaseClient };

const PASSWORD = "rls-test-password-123";

/** Creates a confirmed user through the real sign-up trigger, signed in on its own client. */
export async function createUser(opts: { admin?: boolean; handle?: string | null; positionsConsent?: boolean } = {}): Promise<TestUser> {
  const invite = await createInvite();
  const email = `rls-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" },
    app_metadata: opts.admin ? { role: "admin" } : {},
  });
  if (error) throw error;
  const id = data.user.id;

  // Recording a position needs consent (Part 3). Most tests that record one want it granted.
  if (opts.positionsConsent !== false) {
    const { error: consentError } = await service
      .from("profiles")
      .update({ positions_consent_at: new Date().toISOString(), positions_consent_version: "test" })
      .eq("id", id);
    if (consentError) throw consentError;
  }

  const handle = opts.handle === undefined ? `T${id.replace(/-/g, "").slice(0, 12)}` : opts.handle;
  if (handle) {
    const { error: handleError } = await service.from("profiles").update({ handle }).eq("id", id);
    if (handleError) throw handleError;
  }

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  return { id, email, client };
}

export async function deleteUsers(users: TestUser[]) {
  await purgeUsers(users);
}

export async function createCampaign(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Date.now();
  const { data, error } = await service
    .from("campaigns")
    .insert({
      slug: `rls-${randomUUID().slice(0, 8)}`,
      title: "RLS test Campaign",
      category: "technology",
      status: "open",
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 3_600_000).toISOString(),
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Applies a screening result as the app's server does after posting
 * (Sprint 4: Dispatches start as pending). "allow" makes it visible.
 */
export async function applyScreening(dispatchId: string, outcome: "allow" | "hold" | "block" | "unavailable" = "allow", extra: Record<string, unknown> = {}) {
  const result =
    outcome === "unavailable"
      ? { outcome, reason: "AI unavailable (test)", ...extra }
      : { outcome, model: "test-model", prompt_version: "test.v1", provider: "fake", reason: `Test ${outcome}.`, category: outcome === "allow" ? "none" : "harassment", confidence: 0.9, output: {}, ...extra };
  const { data, error } = await service.rpc("apply_dispatch_screening", { p_dispatch_id: dispatchId, p_result: result });
  if (error) throw error;
  return data as string;
}

/**
 * Removes test users and everything they wrote. Since Sprint 4 deleting a
 * user never deletes Dispatches (it leaves a tombstone), so tests clear their
 * own Dispatches first, with the service role.
 */
export async function purgeUsers(users: { id: string }[]) {
  const ids = users.map((u) => u.id);
  if (ids.length) await service.from("dispatches").delete().in("author_id", ids);
  for (const id of ids) await service.auth.admin.deleteUser(id);
}
