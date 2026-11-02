import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./tests/test-env";

// Refuses to run unless .env.test.local points at LOCAL Supabase.
const env = loadTestEnv();
const port = new URL(env.siteUrl).port || "3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // One at a time: the tests share one database, and the performance test must
  // not compete with other tests for the CPU.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: env.siteUrl,
    trace: "retain-on-failure",
  },
  projects: [
    // Mobile first: the core journey must work at 375px wide.
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    // Production build, so the test sees what users will see. The env vars
    // passed here take precedence over .env.local.
    command: `npm run build && npx next start --port ${port}`,
    url: env.siteUrl,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SITE_URL: env.siteUrl,
      NEXT_PUBLIC_SUPABASE_URL: env.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: env.serviceKey,
      // Emails go to the local Mailpit inbox only.
      EMAIL_TRANSPORT: "mailpit",
      MAILPIT_URL: env.mailpitUrl,
      EMAIL_PROCESSOR_SECRET: env.emailSecret,
    },
  },
});
