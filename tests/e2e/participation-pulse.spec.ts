import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// The participation line on an open Campaign at 375px: hidden under 10 distinct Strategists, shown from 10,
// and hidden, withdrawn and held Dispatches are not counted.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const userIds: string[] = [];
const slug = `e2e-pulse-${randomUUID().slice(0, 8)}`;
let campaignId = "";

async function strategist(i: number) {
  const code = `TGS-PLS-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const { data, error } = await service.auth.admin.createUser({
    email: `pulse${i}-${randomUUID()}@example.test`,
    password: "a long pilot password",
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
  });
  if (error) throw error;
  userIds.push(data.user.id);
  await service.from("profiles").update({ handle: `pls${i}_${randomUUID().replace(/-/g, "").slice(0, 8)}` }).eq("id", data.user.id);
  return data.user.id;
}

async function post(author: string, extra: Record<string, unknown> = {}) {
  const { error } = await service.from("dispatches").insert({ campaign_id: campaignId, author_id: author, kind: "argument", body: "A short argument about opening hours for libraries.", ai_use: "none", moderation_status: "visible", ...extra });
  if (error) throw error;
}

test.afterAll(async () => {
  await service.from("dispatches").delete().eq("campaign_id", campaignId);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await service.from("profiles").delete().in("id", userIds);
  await service.from("campaigns").delete().eq("id", campaignId);
});

test("the participation line stays hidden under 10 Strategists and counts only visible Dispatches", async ({ page }) => {
  test.setTimeout(120_000);
  const now = Date.now();
  const { data: c, error } = await service
    .from("campaigns")
    .insert({ slug, title: "Should libraries open on Sundays?", category: "education", status: "open", starts_at: new Date(now - 600_000).toISOString(), ends_at: new Date(now + 3_600_000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  campaignId = c.id;

  const authors: string[] = [];
  for (let i = 0; i < 10; i++) authors.push(await strategist(i));
  // Nine Strategists posted visibly, and the tenth only has a withdrawn Dispatch: nine distinct counted.
  for (const a of authors.slice(0, 9)) await post(a);
  await post(authors[9], { withdrawn_at: new Date().toISOString() });
  await page.goto(`/campaigns/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Should libraries open on Sundays?" })).toBeVisible();
  await expect(page.getByTestId("participation-pulse")).toHaveCount(0);

  // The tenth posts a visible Dispatch, and one author posts twice: 10 Strategists, 11 Dispatches.
  await post(authors[9]);
  await post(authors[0]);
  await page.goto(`/campaigns/${slug}`);
  await expect(page.getByTestId("participation-pulse")).toHaveText("10 Strategists have posted 11 Dispatches.");
  await expectNoHorizontalOverflow(page);
});
