import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

// Site switches an admin can flip without a deploy (migration 20261113000100).
// The wording members see is kept here, in one place, so the owner can edit it.

export type SiteSwitches = { posting_paused: boolean; signups_paused: boolean; emails_paused: boolean };

export const SWITCH_WORDING = {
  banner: {
    posting: "Posting is paused for a short while. You can still read, react and vote.",
    signups: "New accounts are paused for a short while. People who already have an account can sign in as usual.",
  },
  signUpRefused: {
    message: "New accounts are paused for a short while.",
    hint: "Please try again later. Your invite code stays valid.",
  },
} as const;

const OFF: SiteSwitches = { posting_paused: false, signups_paused: false, emails_paused: false };

/**
 * Reads the three switches (once per request). If the read fails the site
 * behaves as if nothing is paused: a failed read must never lock people out;
 * the database still enforces any switch that is on.
 */
export const getSwitches = cache(async (): Promise<SiteSwitches> => {
  try {
    const { data, error } = await createAdminClient().rpc("site_switches").single();
    if (error || !data) {
      console.error("site_switches failed", error?.code);
      return OFF;
    }
    return data as SiteSwitches;
  } catch (e) {
    console.error("site_switches failed", e instanceof Error ? e.message.slice(0, 120) : "unknown");
    return OFF;
  }
});
