import { describe, expect, it, vi } from "vitest";
import { coachWith, type EngineDeps } from "./engine";
import { weakestLinkOk } from "./policy";
import { AVAILABLE_VERSIONS, loadPrompt, promptVersion, PROMPTS } from "./prompts";
import { fakeProvider } from "./providers/fake";
import type { AiProvider, ProviderRequest } from "./providers/types";
import { COACH_V2_JSON_SCHEMA, JSON_SCHEMAS, coachSchema } from "./schemas";
import { DEFAULT_AI_SETTINGS } from "./types";

// The coach's "weakest link" (prompt v2). Nothing here calls the real API.

function deps(provider: AiProvider = fakeProvider): EngineDeps {
  return { provider, settings: { ...DEFAULT_AI_SETTINGS }, reserve: vi.fn(async () => "ok"), record: vi.fn(async () => {}), env: {}, timeouts: { screening: 50, nudge: 50, coach: 50 } } as unknown as EngineDeps;
}

function scripted(text: string): AiProvider & { requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  return {
    name: "fake",
    requests,
    async complete(req) {
      requests.push(req);
      return { text, inputTokens: 10, outputTokens: 5 };
    },
  };
}

const base = {
  clarity: { rating: "clear", comment: "Your claim is stated in the first line." },
  evidence: { rating: "some", comment: "One figure supports it; what else would a sceptic accept?" },
  steelman: { rating: "missing", comment: "The strongest opposing point is not addressed." },
  tone: { rating: "constructive", comment: "You argue with ideas." },
  questions: ["What would someone who disagrees say first?"],
};
const draft = "The four-day week should become the norm because trials found sick days fell by 20%.";
const q = { title: "Should the four-day week become the norm?", kind: "argument" };

describe("coach output schema", () => {
  it("still accepts a v1 answer with no weakest_link", () => {
    const parsed = coachSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.weakest_link).toBeUndefined();
  });
  it("keeps a usable weakest_link and drops an unusable one without rejecting the answer", () => {
    expect(coachSchema.parse({ ...base, weakest_link: "  The tone is the weakest part.  " }).weakest_link).toBe("The tone is the weakest part.");
    expect(coachSchema.parse({ ...base, weakest_link: "x".repeat(201) }).weakest_link).toBeUndefined();
    expect(coachSchema.parse({ ...base, weakest_link: 7 }).weakest_link).toBeUndefined();
  });
  it("still refuses an unknown field", () => {
    expect(coachSchema.safeParse({ ...base, rewrite: "x" }).success).toBe(false);
  });
  it("sends the v1 JSON schema unchanged and v2 with one extra field", () => {
    expect(Object.keys(JSON_SCHEMAS.coach.properties)).toEqual(["clarity", "evidence", "steelman", "tone", "questions"]);
    expect(Object.keys(COACH_V2_JSON_SCHEMA.properties)).toEqual(["clarity", "evidence", "steelman", "tone", "questions", "weakest_link"]);
  });
});

describe("the v2 prompt", () => {
  it("is a new file; v1 stays available and unchanged in meaning", () => {
    expect(AVAILABLE_VERSIONS.coach).toEqual([1, 2]);
    expect(promptVersion("coach", 1)).toBe("coach.v1");
    expect(promptVersion("coach", 2)).toBe("coach.v2");
    const v1 = loadPrompt("coach", 1).text;
    const v2 = loadPrompt("coach", 2).text;
    for (const line of v1.split("\n").filter((l) => l.length > 40)) expect(v2).toContain(line);
    expect(v2).toMatch(/must NOT write replacement text/);
  });
  it("sets the weakest-link limits", () => {
    const v2 = loadPrompt("coach", 2).text;
    expect(v2).toMatch(/at most 200 characters/);
    expect(v2).toMatch(/clarity, evidence, steelman and tone/);
    expect(v2).toMatch(/Never mention scores, ratings, ranks, judges, winning or losing/);
    expect(v2).toMatch(/do not add any fact/);
  });
});

describe("weakestLinkOk", () => {
  it("accepts one sentence about one part", () => {
    expect(weakestLinkOk("The evidence is thin: the claim rests on one example.", draft)).toBe(true);
    expect(weakestLinkOk("The steelman is missing: the strongest opposing point is not met.", draft)).toBe(true);
  });
  it("refuses more than one part, more than one sentence, or none", () => {
    expect(weakestLinkOk("The evidence and the tone are both weak.", draft)).toBe(false);
    expect(weakestLinkOk("The evidence is thin. The tone is fine.", draft)).toBe(false);
    expect(weakestLinkOk("The draft is weak overall.", draft)).toBe(false);
    expect(weakestLinkOk(undefined, draft)).toBe(false);
  });
  it("refuses scores, ranks, winning, rewrites and new facts", () => {
    expect(weakestLinkOk("The evidence would score badly with a judge.", draft)).toBe(false);
    expect(weakestLinkOk("The evidence is too weak to win.", draft)).toBe(false);
    expect(weakestLinkOk("The evidence is thin, so it ranks low.", draft)).toBe(false);
    expect(weakestLinkOk("The evidence is a 2/5.", draft)).toBe(false);
    expect(weakestLinkOk("The evidence is thin; here is a better version of your claim.", draft)).toBe(false);
    expect(weakestLinkOk('The evidence is thin; try "Trials across forty firms show lower sick leave and steady output".', draft)).toBe(false);
    expect(weakestLinkOk("The evidence is thin: a 2019 study found 35% fewer sick days.", draft)).toBe(false);
    expect(weakestLinkOk("The evidence is thin: the 20% figure has no source.", draft)).toBe(true); // a figure the writer used
    expect(weakestLinkOk(`The evidence is thin: ${"x".repeat(200)}`, draft)).toBe(false);
  });
});

describe("coachWith, prompt versions", () => {
  it("v1 sends the v1 prompt and schema and returns no weakest link", async () => {
    const provider = scripted(JSON.stringify(base));
    const r = await coachWith(deps(provider), draft, q, "u1", { promptVersion: 1 });
    expect(r.ok && r.feedback.weakest_link).toBeFalsy();
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].schema).toBe(JSON_SCHEMAS.coach);
    expect(r.ok && r.record.promptVersion).toBe("coach.v1");
  });
  it("v2 is still exactly one call, with the v2 schema and a shown weakest link", async () => {
    const provider = scripted(JSON.stringify({ ...base, weakest_link: "The steelman is missing: the strongest opposing point is not met." }));
    const r = await coachWith(deps(provider), draft, q, "u1", { promptVersion: 2 });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].schema).toBe(COACH_V2_JSON_SCHEMA);
    expect(r.ok && r.feedback.weakest_link).toBe("The steelman is missing: the strongest opposing point is not met.");
    expect(r.ok && r.record.promptVersion).toBe("coach.v2");
  });
  it("v2 drops a weakest link that breaks the rules but still returns the feedback", async () => {
    const provider = scripted(JSON.stringify({ ...base, weakest_link: "This would score 2 out of 5 and not win." }));
    const r = await coachWith(deps(provider), draft, q, "u1", { promptVersion: 2 });
    expect(r.ok).toBe(true);
    expect(r.ok && "weakest_link" in r.feedback).toBe(false);
  });
  it("a v1 answer under v2 is still valid (the field is optional)", async () => {
    const r = await coachWith(deps(scripted(JSON.stringify(base))), draft, q, "u1", { promptVersion: 2 });
    expect(r.ok).toBe(true);
  });
  it("the fake provider gives v2 a valid weakest link and v1 none", async () => {
    const v2 = await coachWith(deps(), draft, q, "u1", { promptVersion: 2 });
    expect(v2.ok && weakestLinkOk(v2.feedback.weakest_link, draft)).toBe(true);
    const v1 = await coachWith(deps(), draft, q, "u1", { promptVersion: 1 });
    expect(v1.ok && v1.feedback.weakest_link).toBeFalsy();
  });
  it("the default version is unchanged until the evaluation says otherwise", () => {
    expect(PROMPTS.coach.version).toBe(1);
  });
});

describe("weakestLinkOk: one named part, however many ordinary nouns (the c12 finding)", () => {
  const d = "Immigration is a complex and multifaceted issue with many perspectives, and it is important to note that there are arguments on both sides.";

  // The sentence from the real eval (c12, 19 Nov), as recorded in docs/CLAUDE_LOG.md, whose middle was elided there as "...". The
  // middle here is a stand-in written for this test, not the model's words: the real raw answer was not kept.
  it("keeps a sentence that names one part and uses another word as an ordinary noun", () => {
    expect(weakestLinkOk("The clarity is the main problem: the draft takes no position, so there is no claim for evidence or a counter-argument to attach to.", d)).toBe(true);
    expect(weakestLinkOk("The steelman is missing, and there is a lack of evidence for any opposing view.", d)).toBe(true);
    expect(weakestLinkOk("Clarity is the weakest part: there is no claim for evidence to attach to.", d)).toBe(true);
  });

  it("still rejects a sentence that names two parts as parts", () => {
    expect(weakestLinkOk("The evidence and the tone are both weak.", d)).toBe(false);
    expect(weakestLinkOk("The clarity is weak, and so is the tone.", d)).toBe(false);
    expect(weakestLinkOk("The clarity is weak, and so is evidence.", d)).toBe(false);
    expect(weakestLinkOk("Clarity and evidence are both weak.", d)).toBe(false);
    expect(weakestLinkOk("Both your tone and your evidence need work.", d)).toBe(false);
    expect(weakestLinkOk("The tone is fine but the steelman is missing.", d)).toBe(false);
    expect(weakestLinkOk("The evidence is thin, with nothing to back the claim and no sign of a steelman to answer.", d)).toBe(false); // "a steelman" is a second part
  });

  it("still rejects a sentence that names none, and the other rules still apply", () => {
    expect(weakestLinkOk("There is no claim for evidence here.", d)).toBe(false); // only an ordinary noun: names no part
    expect(weakestLinkOk("The clarity is the main problem: it would score badly.", d)).toBe(false);
    expect(weakestLinkOk("The clarity is the main problem, so try writing it plainly.", d)).toBe(false);
  });

  it("reports which rule dropped it", async () => {
    const { weakestLinkRule } = await import("./policy");
    expect(weakestLinkRule("The evidence and the tone are both weak.", d)).toBe("names several parts (evidence, tone)");
    expect(weakestLinkRule("There is no claim for evidence here.", d)).toBe("names none of the four parts");
    expect(weakestLinkRule("The clarity is the main problem: no claim for evidence to attach to.", d)).toBeNull();
  });
});
