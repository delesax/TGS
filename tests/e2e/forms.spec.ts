import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";

// Form controls and option cards: 1px borders at 3:1, 10px radius, 44px or taller, a hover state, and a selected state
// that does not rely on colour alone (a check icon, drawn by CSS).

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const PASSWORD = "a form styles password";

function lum(rgb: string) {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

async function controlStyle(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const bg = (() => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
      }
      return "rgb(255, 255, 255)";
    })();
    return { width: cs.borderTopWidth, radius: cs.borderTopLeftRadius, height: el.getBoundingClientRect().height, border: cs.borderTopColor, bg };
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("inputs have a 1px border at 3:1 or better, a 10px radius and are at least 44px tall", async ({ page }) => {
      await page.goto("/login");
      for (const label of ["Email address", "Password"]) {
        const id = await page.getByLabel(label).evaluate((el) => `#${el.id}`);
        const s = await controlStyle(page, id);
        expect(s.width).toBe("1px");
        expect(s.radius).toBe("10px");
        expect(s.height).toBeGreaterThanOrEqual(44);
        expect(ratio(s.border, s.bg), `${label} border against its background`).toBeGreaterThanOrEqual(3);
      }
      // A clear hover state: the border darkens (light) or lightens (dark) on hover.
      const email = page.getByLabel("Email address");
      const before = await email.evaluate((el) => getComputedStyle(el).borderTopColor);
      await email.hover();
      await expect.poll(() => email.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(before);
    });

    test("option cards show a check icon and a stronger edge when selected, and a focus ring from the keyboard", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/");
      await page.getByRole("banner").getByRole("button", { name: "Display settings: text style and size" }).click();
      const dialog = page.getByRole("dialog", { name: "Text style and size" });
      const card = (name: RegExp) => dialog.getByRole("radio", { name }).locator("xpath=ancestor::label");
      const inter = card(/^Inter/);
      const lexend = card(/^Lexend/);
      const afterContent = (l: ReturnType<typeof card>) => l.evaluate((el) => getComputedStyle(el, "::after").content);
      expect(await afterContent(inter)).toBe("none");
      const edgeBefore = await inter.evaluate((el) => getComputedStyle(el).borderTopColor);
      await dialog.getByRole("radio", { name: /^Inter/ }).check();
      expect(await afterContent(inter)).not.toBe("none"); // the check icon
      await expect.poll(() => inter.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(edgeBefore); // the edge moves to the stronger colour
      expect(await afterContent(lexend)).toBe("none");
      // The unselected card edge is a 3:1 control border; the selected one is stronger still.
      const s = await inter.evaluate((el) => ({ w: getComputedStyle(el).borderTopWidth, r: getComputedStyle(el).borderTopLeftRadius, h: el.getBoundingClientRect().height }));
      expect(s.w).toBe("1px");
      expect(s.r).toBe("10px");
      expect(s.h).toBeGreaterThanOrEqual(44);
      // Keyboard focus draws a visible ring around the whole card.
      await dialog.getByRole("radio", { name: /^Lexend/ }).focus();
      await page.keyboard.press("Space");
      expect(await lexend.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      await dialog.getByRole("button", { name: "Reset to default" }).click();
    });
  });
}

test("the Dispatch composer's option cards use the same selected state", async ({ browser }) => {
  const code = `TGS-FORM-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1, note: "playwright forms" });
  const email = `e2e-forms-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" },
  });
  if (error) throw error;
  await service.from("profiles").update({ handle: `Forms_${randomUUID().replace(/-/g, "").slice(0, 8)}` }).eq("id", data.user.id);
  const slug = `e2e-forms-${randomUUID().slice(0, 6)}`;
  const now = Date.now();
  await service.from("campaigns").insert({ slug, title: "Should forms look calm?", summary: "s", rules: "Be civil.", category: "education", status: "open", starts_at: new Date(now - 60_000).toISOString(), ends_at: new Date(now + 86_400_000).toISOString(), opinion_not_advice: false });
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto(`/campaigns/${slug}`);
    const textarea = page.getByRole("textbox", { name: /Your Dispatch/ });
    const t = await textarea.evaluate((el) => ({ w: getComputedStyle(el).borderTopWidth, r: getComputedStyle(el).borderTopLeftRadius }));
    expect(t).toEqual({ w: "1px", r: "10px" });
    const cards = page.locator("main label.option-card");
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    const first = cards.first();
    await first.locator("input").check();
    expect(await first.evaluate((el) => getComputedStyle(el, "::after").content)).not.toBe("none");
    expect(await cards.nth(1).evaluate((el) => getComputedStyle(el, "::after").content)).toBe("none");
  } finally {
    await context.close();
    await service.from("campaigns").delete().eq("slug", slug);
    await service.auth.admin.deleteUser(data.user.id);
  }
});
