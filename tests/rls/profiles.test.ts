import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createUser, deleteUsers, service, type TestUser } from "./helpers";

let alice: TestUser;
let bob: TestUser;
let newcomer: TestUser; // signed up, no handle yet

beforeAll(async () => {
  [alice, bob, newcomer] = await Promise.all([createUser(), createUser(), createUser({ handle: null })]);
});
afterAll(() => deleteUsers([alice, bob, newcomer]));

describe("profiles", () => {
  it("are not readable by anonymous visitors", async () => {
    const { data } = await anonClient().from("profiles").select("id").eq("id", alice.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("with a handle are readable by other signed-in Strategists (public columns only)", async () => {
    const { data, error } = await bob.client.from("profiles").select("id, handle, display_name").eq("id", alice.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hide private columns such as invite_id and consent timestamps", async () => {
    const { error } = await alice.client.from("profiles").select("invite_id, age_confirmed_at").eq("id", alice.id);
    expect(error).not.toBeNull();
  });

  it("without a handle are visible only to their owner", async () => {
    const { data: asBob } = await bob.client.from("profiles").select("id").eq("id", newcomer.id);
    expect(asBob ?? []).toHaveLength(0);
    const { data: asSelf } = await newcomer.client.from("profiles").select("id").eq("id", newcomer.id);
    expect(asSelf).toHaveLength(1);
  });

  it("can be edited by their owner", async () => {
    const { error } = await alice.client.from("profiles").update({ display_name: "Alice A" }).eq("id", alice.id);
    expect(error).toBeNull();
    const { data } = await service.from("profiles").select("display_name").eq("id", alice.id).single();
    expect(data!.display_name).toBe("Alice A");
  });

  it("cannot be edited by anyone else", async () => {
    await bob.client.from("profiles").update({ display_name: "Hacked" }).eq("id", alice.id);
    const { data } = await service.from("profiles").select("display_name").eq("id", alice.id).single();
    expect(data!.display_name).not.toBe("Hacked");
  });

  it("do not let a Strategist set or change their own handle (the server screens it first)", async () => {
    const { error: setError } = await newcomer.client.from("profiles").update({ handle: "admin" }).eq("id", newcomer.id);
    expect(setError).not.toBeNull();
    const { error: changeError } = await alice.client.from("profiles").update({ handle: "Someone_Else" }).eq("id", alice.id);
    expect(changeError).not.toBeNull();
  });

  it("cannot be created or deleted from the browser", async () => {
    const { error: insertError } = await alice.client
      .from("profiles")
      .insert({ id: crypto.randomUUID(), age_confirmed_at: new Date().toISOString(), terms_accepted_at: new Date().toISOString() });
    expect(insertError).not.toBeNull();

    await alice.client.from("profiles").delete().eq("id", alice.id);
    const { data } = await service.from("profiles").select("id").eq("id", alice.id);
    expect(data).toHaveLength(1);
  });

  it("enforce case-insensitive unique handles", async () => {
    const { data } = await service.from("profiles").select("handle").eq("id", alice.id).single();
    const { error } = await service.from("profiles").update({ handle: data!.handle!.toLowerCase() }).eq("id", bob.id);
    expect(error?.code).toBe("23505");
  });
});
