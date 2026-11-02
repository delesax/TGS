import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createUser, deleteUsers, service, type TestUser } from "./helpers";

let user: TestUser;
let other: TestUser;
let admin: TestUser;

beforeAll(async () => {
  [user, other, admin] = await Promise.all([createUser(), createUser(), createUser({ admin: true })]);
});
afterAll(() => deleteUsers([user, other, admin]));

describe("audit_log", () => {
  it("records account creation", async () => {
    const { data } = await service.from("audit_log").select("action").eq("target_id", user.id);
    expect(data!.map((r) => r.action)).toContain("account.created");
  });

  it("is readable only by admins", async () => {
    for (const client of [anonClient(), user.client]) {
      const { data } = await client.from("audit_log").select("id").limit(1);
      expect(data ?? []).toHaveLength(0);
    }
    const { data } = await admin.client.from("audit_log").select("id").limit(1);
    expect(data).toHaveLength(1);
  });

  it("cannot be written from the browser", async () => {
    const { error } = await user.client.from("audit_log").insert({ action: "fake.entry" });
    expect(error).not.toBeNull();
  });

  it("is append-only, even for the service role", async () => {
    const { data: row } = await service.from("audit_log").select("id").eq("target_id", user.id).limit(1).single();
    const { error: updateError } = await service.from("audit_log").update({ action: "changed.entry" }).eq("id", row!.id);
    expect(updateError?.message).toContain("AUDIT_LOG_APPEND_ONLY");
    const { error: deleteError } = await service.from("audit_log").delete().eq("id", row!.id);
    expect(deleteError?.message).toContain("AUDIT_LOG_APPEND_ONLY");
  });
});

describe("ai_decisions", () => {
  let decisionId: string;

  beforeAll(async () => {
    const { data, error } = await service
      .from("ai_decisions")
      .insert({
        subject_type: "handle",
        subject_id: "admin",
        user_id: user.id,
        model: "stub-denylist",
        prompt_version: "handle-screen-stub-v1",
        outcome: "block",
        reason: "Impersonation",
      })
      .select("id")
      .single();
    if (error) throw error;
    decisionId = data.id;
  });

  it("are hidden from Strategists, including the subject", async () => {
    const { data } = await user.client.from("ai_decisions").select("id").eq("id", decisionId);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot be inserted or overridden by Strategists", async () => {
    const { error } = await user.client
      .from("ai_decisions")
      .insert({ subject_type: "handle", subject_id: "x", model: "m", prompt_version: "v", outcome: "allow", reason: "r" });
    expect(error).not.toBeNull();

    await user.client
      .from("ai_decisions")
      .update({ overridden_by: user.id, overridden_at: new Date().toISOString(), override_outcome: "allow", override_reason: "me" })
      .eq("id", decisionId);
    const { data } = await service.from("ai_decisions").select("overridden_at").eq("id", decisionId).single();
    expect(data!.overridden_at).toBeNull();
  });

  it("can be overridden by an admin, in their own name only", async () => {
    const { error: asOther } = await admin.client
      .from("ai_decisions")
      .update({ overridden_by: user.id, overridden_at: new Date().toISOString(), override_outcome: "allow", override_reason: "x" })
      .eq("id", decisionId);
    expect(asOther).not.toBeNull();

    const { error } = await admin.client
      .from("ai_decisions")
      .update({ overridden_by: admin.id, overridden_at: new Date().toISOString(), override_outcome: "allow", override_reason: "Reviewed" })
      .eq("id", decisionId);
    expect(error).toBeNull();
  });

  it("cannot have their original AI output rewritten, even by an admin", async () => {
    const { error } = await admin.client.from("ai_decisions").update({ reason: "Rewritten" }).eq("id", decisionId);
    expect(error).not.toBeNull();
  });
});

describe("passkeys and challenges", () => {
  let passkeyId: string;

  beforeAll(async () => {
    const { data, error } = await service
      .from("passkeys")
      .insert({ user_id: user.id, credential_id: `cred-${user.id}`, public_key: "pk", nickname: "Test" })
      .select("id")
      .single();
    if (error) throw error;
    passkeyId = data.id;
  });

  it("are visible to their owner only, without the public key column", async () => {
    const { data: mine } = await user.client.from("passkeys").select("id, nickname").eq("id", passkeyId);
    expect(mine).toHaveLength(1);
    const { data: theirs } = await other.client.from("passkeys").select("id").eq("id", passkeyId);
    expect(theirs ?? []).toHaveLength(0);
    const { error } = await user.client.from("passkeys").select("public_key").eq("id", passkeyId);
    expect(error).not.toBeNull();
  });

  it("cannot be added from the browser (the server verifies them first)", async () => {
    const { error } = await user.client.from("passkeys").insert({ user_id: user.id, credential_id: "forged", public_key: "x" });
    expect(error).not.toBeNull();
  });

  it("cannot be removed by someone else, but can by their owner", async () => {
    await other.client.from("passkeys").delete().eq("id", passkeyId);
    const { data: still } = await service.from("passkeys").select("id").eq("id", passkeyId);
    expect(still).toHaveLength(1);

    await user.client.from("passkeys").delete().eq("id", passkeyId);
    const { data: gone } = await service.from("passkeys").select("id").eq("id", passkeyId);
    expect(gone).toHaveLength(0);
  });

  it("challenges are off-limits to browser roles", async () => {
    for (const client of [anonClient(), user.client]) {
      const { error } = await client.from("webauthn_challenges").select("id").limit(1);
      expect(error).not.toBeNull();
    }
  });
});
