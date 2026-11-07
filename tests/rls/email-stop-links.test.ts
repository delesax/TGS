import { afterAll, describe, expect, it } from "vitest";
import { createUser, deleteUsers, service, type TestUser } from "./helpers";

// Part 4G: the "stop these emails" link in each optional email actually works.

const users: TestUser[] = [];
afterAll(() => deleteUsers(users));

describe("stop links, one per email type", () => {
  it.each([
    ["replies", "replies"],
    ["campaign_updates", "campaign_updates"],
    ["closing_soon", "closing_soon"],
    ["moderation", "moderation"],
  ])("kind=%s switches off only that kind", async (kind, column) => {
    const user = await createUser();
    users.push(user);
    const { data: prefs } = await service.from("notification_preferences").select("unsubscribe_token").eq("user_id", user.id).single();
    const { data: ok, error } = await service.rpc("unsubscribe_by_token", { p_token: prefs!.unsubscribe_token, p_kind: kind });
    expect(error).toBeNull();
    expect(ok).toBe(true);
    const { data: after } = await service.from("notification_preferences").select("replies, campaign_updates, closing_soon, moderation").eq("user_id", user.id).single();
    for (const [key, value] of Object.entries(after!)) expect(value, key).toBe(key === column ? false : true);
  });
});
