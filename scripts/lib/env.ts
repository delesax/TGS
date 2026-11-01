import { loadEnvConfig } from "@next/env";

/** Loads .env.local (and friends) the same way Next.js does. Values are never printed. */
export function loadEnv() {
  loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
}

export function requireVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable: ${name}. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

/** Host only, never keys. Lets the operator confirm which project a script will touch. */
export function describeTarget(url: string): string {
  const host = new URL(url).host;
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `${host} (local Supabase)` : `${host} (hosted Supabase)`;
}
