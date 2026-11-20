import { describe, expect, it } from "vitest";
import { buildOpenArenaRules } from "@/lib/campaign-rules";
import { DEFAULT_LIMITS, type DispatchLimits } from "@/lib/dispatches";
import { service } from "./helpers";

// The Campaign draft helper builds the rules text from the live limits (community_settings) and falls back to DEFAULT_LIMITS.
// If the database defaults and the code defaults ever drift apart, the rules text a Campaign gets would be stale: this fails.

describe("the rules template and the live database limits", () => {
  it("the database limits equal DEFAULT_LIMITS on a freshly reset database", async () => {
    const { data, error } = await service
      .from("community_settings")
      .select("argument_max_chars, rebuttal_max_chars, evidence_max_chars, max_dispatches_per_round, cooldown_seconds, edit_window_seconds")
      .single<DispatchLimits>();
    expect(error).toBeNull();
    expect(data).toEqual(DEFAULT_LIMITS);
  });

  it("the rules built from the live row state every live limit", async () => {
    const { data } = await service
      .from("community_settings")
      .select("argument_max_chars, rebuttal_max_chars, evidence_max_chars, max_dispatches_per_round, cooldown_seconds, edit_window_seconds")
      .single<DispatchLimits>();
    const text = buildOpenArenaRules(data!);
    expect(text).toContain(`up to ${data!.argument_max_chars.toLocaleString("en-GB")} characters`);
    expect(text).toContain(`up to ${data!.max_dispatches_per_round} Dispatches`);
  });
});
