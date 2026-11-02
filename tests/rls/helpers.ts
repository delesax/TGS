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
export async function createUser(opts: { admin?: boolean; handle?: string | null } = {}): Promise<TestUser> {
  const invite = await createInvite();
  const email = `rls-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { invite_code: invite.code, age_confirmed: true, terms_accepted: true },
    app_metadata: opts.admin ? { role: "admin" } : {},
  });
  if (error) throw error;
  const id = data.user.id;

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
  for (const u of users) await service.auth.admin.deleteUser(u.id);
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
