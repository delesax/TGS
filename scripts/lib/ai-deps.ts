import type { SupabaseClient } from "@supabase/supabase-js";
import type { EngineDeps } from "../../src/lib/ai/engine";
import { createAnthropicProvider } from "../../src/lib/ai/providers/anthropic";
import { fakeProvider } from "../../src/lib/ai/providers/fake";
import { DEFAULT_AI_SETTINGS } from "../../src/lib/ai/types";

/**
 * AI dependencies for scripts. The fake provider unless `real` is asked for
 * explicitly and a key is set. Caps are not applied; usage is not recorded.
 */
export function scriptDeps({ real }: { real: boolean }): EngineDeps {
  const key = process.env.ANTHROPIC_API_KEY;
  if (real && !key) throw new Error("--real needs ANTHROPIC_API_KEY. Nothing was sent.");
  return {
    provider: real && key ? createAnthropicProvider(key) : fakeProvider,
    settings: { ...DEFAULT_AI_SETTINGS },
    reserve: async () => "ok",
    record: async () => {},
  };
}

/** Same, but checking caps and recording usage in the database (local seed). */
export function databaseDeps(db: SupabaseClient): EngineDeps {
  return {
    ...scriptDeps({ real: false }),
    async reserve(feature, userId) {
      const { data } = await db.rpc("ai_reserve_call", { p_feature: feature, p_user_id: userId });
      return String(data);
    },
    async record(feature, userId, input, output, failed) {
      await db.rpc("ai_record_usage", { p_feature: feature, p_user_id: userId, p_input_tokens: input, p_output_tokens: output, p_failed: failed });
    },
  };
}
