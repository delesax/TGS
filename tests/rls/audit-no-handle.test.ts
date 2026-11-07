import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, deleteUsers, service, type TestUser } from "./helpers";

// Migration 20261104000500: deciding a held handle must not write the handle into
// audit_log, which can never be edited or erased. LOCAL Supabase only.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
let admin: TestUser;
const users: TestUser[] = [];

async function heldHandle(handle: string) {
  const user = await createUser({ handle: null });
  users.push(user);
  const { data, error } = await service
    .from("moderation_flags")
    .insert({ kind: "held_handle", user_id: user.id, details: { handle, category: "impersonation", reason: "Looks official." } })
    .select("id")
    .single();
  if (error) throw error;
  return { user, flagId: data.id as string };
}

/** Every audit row, as text, that mentions the string anywhere. */
async function auditRowsMentioning(text: string) {
  return sql<{ id: number; action: string; target_id: string | null; details: unknown }[]>`
    select id, action, target_id, details from public.audit_log
    where details::text ilike ${"%" + text + "%"} or coalesce(target_id, '') ilike ${"%" + text + "%"} or action ilike ${"%" + text + "%"}`;
}

beforeAll(async () => {
  admin = await createUser({ admin: true });
});

afterAll(async () => {
  await sql.end();
  await deleteUsers([admin, ...users]);
});

describe("deciding a held handle leaves no handle in the audit log", () => {
  it("release: the handle is given, the audit entry holds only flag_id and reason", async () => {
    const handle = `Audit_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const { user, flagId } = await heldHandle(handle);

    const { error } = await admin.client.rpc("decide_held_handle", { p_flag_id: flagId, p_action: "release", p_reason: "A real person, checked." });
    expect(error).toBeNull();
    // The decision itself still worked.
    expect((await service.from("profiles").select("handle").eq("id", user.id).single()).data).toEqual({ handle });

    const { data: rows } = await service.from("audit_log").select("action, actor_id, target_table, target_id, details").eq("target_id", user.id).eq("action", "moderation.handle_released");
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ actor_id: admin.id, target_table: "profiles" });
    expect(Object.keys(rows![0].details as object).sort()).toEqual(["flag_id", "reason"]);
    expect(rows![0].details).toEqual({ flag_id: flagId, reason: "A real person, checked." });

    // And the handle is nowhere in the audit log: not in any row's details, target or action.
    expect(await auditRowsMentioning(handle)).toEqual([]);
  });

  it("keep held: no handle in the audit entry, and the Strategist still has none", async () => {
    const handle = `Audit_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const { user, flagId } = await heldHandle(handle);

    const { error } = await admin.client.rpc("decide_held_handle", { p_flag_id: flagId, p_action: "keep_held", p_reason: "Could pass for staff." });
    expect(error).toBeNull();
    expect((await service.from("profiles").select("handle").eq("id", user.id).single()).data).toEqual({ handle: null });

    const { data: rows } = await service.from("audit_log").select("details").eq("target_id", user.id).eq("action", "moderation.handle_kept_held");
    expect(rows).toHaveLength(1);
    expect(rows![0].details).toEqual({ flag_id: flagId, reason: "Could pass for staff." });
    expect(await auditRowsMentioning(handle)).toEqual([]);
  });

  it("every audit row for the Strategist, whatever its action, is free of the handle", async () => {
    const handle = `Audit_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const { user, flagId } = await heldHandle(handle);
    await admin.client.rpc("decide_held_handle", { p_flag_id: flagId, p_action: "release", p_reason: "Fine." });
    const { data: all } = await service.from("audit_log").select("action, details").eq("target_id", user.id);
    expect(all!.length).toBeGreaterThan(0);
    expect(JSON.stringify(all)).not.toContain(handle);
  });

  it("still refuses what it refused before: non-admins, a missing reason, and an unknown action", async () => {
    const { user, flagId } = await heldHandle(`Audit_${randomUUID().replace(/-/g, "").slice(0, 10)}`);
    expect((await user.client.rpc("decide_held_handle", { p_flag_id: flagId, p_action: "release", p_reason: "Mine" })).error?.message).toMatch(/^NOT_ADMIN/);
    expect((await admin.client.rpc("decide_held_handle", { p_flag_id: flagId, p_action: "release", p_reason: "  " })).error?.message).toMatch(/^REASON_REQUIRED/);
    expect((await admin.client.rpc("decide_held_handle", { p_flag_id: flagId, p_action: "delete", p_reason: "No" })).error?.message).toMatch(/^BAD_ACTION/);
    expect((await service.rpc("decide_held_handle", { p_flag_id: flagId, p_action: "release", p_reason: "Service role is not an admin" })).error).not.toBeNull();
  });

  it("the handle stays in moderation_flags, which is scrubbed when an account is deleted (unlike the audit log)", async () => {
    const handle = `Audit_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const { user, flagId } = await heldHandle(handle);
    await admin.client.rpc("decide_held_handle", { p_flag_id: flagId, p_action: "keep_held", p_reason: "No." });
    const { data } = await service.from("moderation_flags").select("details").eq("id", flagId).single();
    expect((data!.details as { handle: string }).handle).toBe(handle);
    expect(user.id).toBeTruthy();
  });
});
