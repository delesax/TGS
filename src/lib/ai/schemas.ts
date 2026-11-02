import { z } from "zod";

// Structured outputs for every AI call. The model is asked for JSON matching
// the JSON schema; the answer is then validated again with zod, and anything
// that does not validate is discarded (never partly used). Only fixed enum
// values are accepted for anything that decides an outcome.

export const DISPATCH_CATEGORIES = [
  "none",
  "hate",
  "harassment",
  "impersonation",
  "threats",
  "personal_information",
  "sexual_content",
  "self_harm",
  "spam",
] as const;
export type DispatchCategory = (typeof DISPATCH_CATEGORIES)[number];

export const HANDLE_CATEGORIES = ["none", "impersonation", "hate", "harassment", "sexual_content", "threats", "spam"] as const;

const reason = z.string().trim().min(3).max(300);
const confidence = z.number().min(0).max(1);

export const dispatchScreenSchema = z.strictObject({
  category: z.enum(DISPATCH_CATEGORIES),
  confidence,
  reason,
  likely_ai_generated: z.boolean(),
  ai_generated_reason: z.string().trim().max(300),
});
export type DispatchScreenOutput = z.infer<typeof dispatchScreenSchema>;

export const textScreenSchema = z.strictObject({
  category: z.enum(HANDLE_CATEGORIES),
  confidence,
  reason,
});
export type TextScreenOutput = z.infer<typeof textScreenSchema>;

export const NUDGE_KINDS = ["none", "personal_attack", "insult", "hostile_tone", "mocking"] as const;

export const nudgeSchema = z.strictObject({
  kind: z.enum(NUDGE_KINDS),
  // Shown privately to the author. Empty when kind is "none".
  message: z.string().trim().max(240),
});
export type NudgeOutput = z.infer<typeof nudgeSchema>;

const coachPoint = <T extends readonly [string, ...string[]]>(ratings: T) =>
  z.strictObject({ rating: z.enum(ratings), comment: z.string().trim().min(3).max(300) });

export const coachSchema = z.strictObject({
  clarity: coachPoint(["clear", "partly_clear", "unclear"] as const),
  evidence: coachPoint(["strong", "some", "none"] as const),
  steelman: coachPoint(["acknowledged", "partly", "missing"] as const),
  tone: coachPoint(["constructive", "mixed", "hostile"] as const),
  questions: z.array(z.string().trim().min(5).max(200)).min(1).max(4),
});
export type CoachOutput = z.infer<typeof coachSchema>;

// JSON schemas sent to the API (structured outputs). Kept simple: object
// shapes and enums; ranges are checked by zod afterwards.
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const enumOf = (values: readonly string[]) => ({ type: "string", enum: [...values] });
const str = { type: "string" };
const num = { type: "number" };

export const JSON_SCHEMAS = {
  screen_dispatch: obj({
    category: enumOf(DISPATCH_CATEGORIES),
    confidence: num,
    reason: str,
    likely_ai_generated: { type: "boolean" },
    ai_generated_reason: str,
  }),
  screen_text: obj({ category: enumOf(HANDLE_CATEGORIES), confidence: num, reason: str }),
  nudge: obj({ kind: enumOf(NUDGE_KINDS), message: str }),
  coach: obj({
    clarity: obj({ rating: enumOf(["clear", "partly_clear", "unclear"]), comment: str }),
    evidence: obj({ rating: enumOf(["strong", "some", "none"]), comment: str }),
    steelman: obj({ rating: enumOf(["acknowledged", "partly", "missing"]), comment: str }),
    tone: obj({ rating: enumOf(["constructive", "mixed", "hostile"]), comment: str }),
    questions: { type: "array", items: str },
  }),
} as const;

/** Parses model text as JSON and validates it. Returns null for anything else. */
export function parseStrict<T>(schema: z.ZodType<T>, text: string): T | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
