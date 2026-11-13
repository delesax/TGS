// Shared helpers for the LOCAL load tests (Sprint 7, plan section 3.3). Nothing here can reach hosted Supabase:
// loadTestEnv() refuses any URL that is not 127.0.0.1 or localhost, and the database URL is fixed to the local one.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { loadTestEnv } from "../../tests/test-env";

export const env = loadTestEnv();
export const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const PASSWORD = "load-test-password-123";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const service = createClient(env.supabaseUrl, env.serviceKey, noSession);
export const anon = () => createClient(env.supabaseUrl, env.anonKey, noSession);
export const sql = postgres(LOCAL_DB_URL, { max: 8, onnotice: () => {} });

export type Row = { scenario: string; check: string; threshold: string; result: string; pass: boolean };
export const rows: Row[] = [];
export function record(scenario: string, check: string, threshold: string, result: string, pass: boolean) {
  rows.push({ scenario, check, threshold, result, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  [${scenario}] ${check}: ${result} (need ${threshold})`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
export async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value?: T; error?: unknown }> {
  const t = performance.now();
  try {
    const value = await fn();
    return { ms: performance.now() - t, value };
  } catch (error) {
    return { ms: performance.now() - t, error };
  }
}
/** Runs tasks with at most `n` at once. */
export async function pool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } }));
}

export async function createInvite(maxUses: number, note: string) {
  const code = `LOAD-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await service.from("invites").insert({ code, max_uses: maxUses, note }).select("id, code").single();
  if (error) throw error;
  return data;
}
export type LoadUser = { id: string; email: string; client?: SupabaseClient };
export async function createLoadUser(invite: { code: string }, tag: string, opts: { old?: boolean } = {}): Promise<LoadUser> {
  const email = `load-${tag}-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "load", privacy_version: "load" },
  });
  if (error) throw error;
  const id = data.user.id;
  const created = opts.old ? new Date(Date.now() - 3 * 86_400_000).toISOString() : undefined;
  await sql`update public.profiles set handle = ${"L" + id.replace(/-/g, "").slice(0, 12)}, positions_consent_at = now(), positions_consent_version = 'load' ${created ? sql`, created_at = ${created}` : sql``} where id = ${id}`;
  return { id, email };
}
export async function signIn(u: LoadUser): Promise<SupabaseClient> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email: u.email, password: PASSWORD });
  if (error) throw error;
  u.client = client;
  return client;
}
export async function loadCampaign(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Date.now();
  const { data, error } = await service.from("campaigns").insert({
    slug: `load-${randomUUID().slice(0, 8)}`, title: "Load test Campaign", category: "technology", status: "open",
    starts_at: new Date(now - 60_000).toISOString(), ends_at: new Date(now + 3_600_000).toISOString(), ...overrides,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}
/** Removes every row a load run created, by the LOAD- invite note and the load- email prefix. */
export async function cleanup() {
  await sql`delete from public.dispatches where campaign_id in (select id from public.campaigns where title like 'Load test%')`;
  await sql`delete from public.dispatches where author_id in (select id from auth.users where email like 'load-%@example.test')`;
  await sql`delete from public.campaigns where title like 'Load test%'`;
  const users = await sql`select id from auth.users where email like 'load-%@example.test'`;
  await pool(users, 8, async (u) => { await service.auth.admin.deleteUser(u.id as string); });
  await sql`delete from public.invites where note like 'load test%'`;
  await sql`delete from public.email_outbox where dedupe_key like 'load:%'`;
}
