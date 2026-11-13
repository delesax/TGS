import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createUser, deleteUsers, service, type TestUser } from "./helpers";

let alice: TestUser;
let admin: TestUser;
const emails: string[] = [];
const email = () => {
  const e = `pr-${randomUUID()}@example.test`;
  emails.push(e);
  return e;
};

beforeAll(async () => {
  [alice, admin] = await Promise.all([createUser(), createUser({ admin: true })]);
});

afterAll(async () => {
  await service.from("privacy_requests").delete().in("email", emails);
  await deleteUsers([alice, admin]);
});

async function create(e: string, type = "question", message = "A private message with SECRET-WORDS in it.") {
  return service.rpc("create_privacy_request", { p_type: type, p_email: e, p_user_id: null, p_message: message });
}

describe("privacy_requests is closed to the browser", () => {
  it("nobody in the browser can read, write, change or delete it", async () => {
    const e = email();
    const { data: id } = await create(e);
    for (const client of [anonClient(), alice.client, admin.client]) {
      expect((await client.from("privacy_requests").select("*")).error).not.toBeNull();
      expect((await client.from("privacy_requests").insert({ type: "question", email: e, message: "x" })).error).not.toBeNull();
      expect((await client.from("privacy_requests").update({ status: "closed" }).eq("id", id)).error).not.toBeNull();
      expect((await client.from("privacy_requests").delete().eq("id", id)).error).not.toBeNull();
    }
    expect((await service.from("privacy_requests").select("status").eq("id", id)).data).toEqual([{ status: "new" }]);
  });

  it("the create and acknowledge functions are for the server only", async () => {
    for (const client of [anonClient(), alice.client, admin.client]) {
      expect((await client.rpc("create_privacy_request", { p_type: "question", p_email: email(), p_user_id: null, p_message: "x" })).error).not.toBeNull();
      expect((await client.rpc("acknowledge_privacy_request", { p_id: randomUUID() })).error).not.toBeNull();
    }
  });
});

describe("the record", () => {
  it("defaults: status new, due one month after it was made, emails lowercased", async () => {
    const e = email();
    const { data: id } = await create(e.toUpperCase());
    const { data } = await service.from("privacy_requests").select("status, email, created_at, due_at").eq("id", id).single();
    expect(data!.status).toBe("new");
    expect(data!.email).toBe(e);
    const days = (Date.parse(data!.due_at) - Date.parse(data!.created_at)) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("only accepts the nine types", async () => {
    expect((await create(email(), "nonsense")).error).not.toBeNull();
    for (const t of ["question", "access", "correction", "deletion", "restriction", "objection", "withdraw_consent", "dispatch_removal", "complaint"]) {
      expect((await create(email(), t)).error, t).toBeNull();
    }
  });

  it("limits each email address to 5 a day, counted in the database", async () => {
    const e = email();
    for (let i = 0; i < 5; i++) expect((await create(e)).error).toBeNull();
    const sixth = await create(e);
    expect(sixth.error?.message).toMatch(/^RATE_LIMITED/);
    expect((await create(e.toUpperCase())).error?.message).toMatch(/^RATE_LIMITED/); // case does not matter
    expect((await create(email())).error).toBeNull(); // another address is fine
  });

  it("acknowledging sets the time and moves new to acknowledged", async () => {
    const { data: id } = await create(email());
    await service.rpc("acknowledge_privacy_request", { p_id: id });
    const { data } = await service.from("privacy_requests").select("status, acknowledged_at").eq("id", id).single();
    expect(data!.status).toBe("acknowledged");
    expect(data!.acknowledged_at).not.toBeNull();
  });
});

describe("admin functions", () => {
  it("refuse everyone who is not an admin", async () => {
    const { data: id } = await create(email());
    for (const client of [anonClient(), alice.client]) {
      expect((await client.rpc("admin_list_privacy_requests", { p_status: null })).error).not.toBeNull();
      expect((await client.rpc("admin_update_privacy_request", { p_id: id, p_status: "closed", p_outcome_note: "x" })).error).not.toBeNull();
      expect((await client.rpc("admin_open_privacy_request", { p_id: id })).error).not.toBeNull();
    }
    expect((await service.from("privacy_requests").select("status").eq("id", id)).data).toEqual([{ status: "new" }]);
  });

  it("let an admin list, open and update, and log the request id only (never the message, email or note)", async () => {
    const e = email();
    const { data: id } = await create(e, "complaint", "A private message with SECRET-WORDS in it.");
    const listed = await admin.client.rpc("admin_list_privacy_requests", { p_status: "new" });
    expect(listed.error).toBeNull();
    expect((listed.data as { id: string }[]).some((r) => r.id === id)).toBe(true);

    expect((await admin.client.rpc("admin_open_privacy_request", { p_id: id })).error).toBeNull();
    const upd = await admin.client.rpc("admin_update_privacy_request", { p_id: id, p_status: "closed", p_outcome_note: "Replied with OUTCOME-WORDS." });
    expect(upd.error).toBeNull();

    const { data: row } = await service.from("privacy_requests").select("status, closed_at, acknowledged_at, outcome_note").eq("id", id).single();
    expect(row!.status).toBe("closed");
    expect(row!.closed_at).not.toBeNull();
    expect(row!.outcome_note).toBe("Replied with OUTCOME-WORDS.");

    const { data: log } = await service.from("audit_log").select("action, actor_id, details").eq("target_id", id).order("id");
    expect(log!.map((l) => l.action)).toEqual(["privacy_request.opened", "privacy_request.updated"]);
    const text = JSON.stringify(log);
    for (const secret of ["SECRET-WORDS", "OUTCOME-WORDS", e]) expect(text).not.toContain(secret);
    expect(log![1].details).toEqual({ from: "new", to: "closed" });
  });

  it("rejects an unknown status", async () => {
    const { data: id } = await create(email());
    expect((await admin.client.rpc("admin_update_privacy_request", { p_id: id, p_status: "bogus", p_outcome_note: "" })).error).not.toBeNull();
  });
});
