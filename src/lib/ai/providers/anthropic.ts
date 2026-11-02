import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, ProviderRequest, ProviderResponse } from "./types";

// The only place that talks to the Anthropic API. Server side only: the key
// is read from the environment and this module refuses to run in a browser.
// Retries and time limits are handled by the engine, so the SDK's own are off.

export function createAnthropicProvider(apiKey: string): AiProvider {
  if (typeof window !== "undefined") throw new Error("The AI provider must not run in the browser");
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  return {
    name: "anthropic",
    async complete(req: ProviderRequest): Promise<ProviderResponse> {
      // Haiku answers fastest with thinking off. Other models (Sonnet for the
      // coach) do not accept "disabled", so they think adaptively at low effort.
      const isHaiku = req.model.startsWith("claude-haiku");
      const response = await client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          // The prompt is the same for every call, so it is cached.
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: req.user }],
          output_config: { format: { type: "json_schema", schema: req.schema }, effort: req.task === "coach" ? "medium" : "low" },
          ...(isHaiku ? { thinking: { type: "disabled" as const } } : {}),
        },
        { signal: req.signal },
      );
      if (response.stop_reason === "refusal") throw new Error("The model declined to answer");
      if (response.stop_reason === "max_tokens") throw new Error("The answer was cut off");
      const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      const usage = response.usage;
      return {
        text,
        inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.output_tokens ?? 0,
      };
    },
  };
}
