import { describe, expect, it, vi } from "vitest";
import { coachWith, type EngineDeps } from "./engine";
import { replacementTextRule } from "./policy";
import { ProviderStopError, type AiProvider } from "./providers/types";
import { DEFAULT_AI_SETTINGS } from "./types";

// Why a coach call failed, by category. Diagnostics only: what the member sees and what is stored do not change.

const good = {
  clarity: { rating: "clear", comment: "Your claim is stated in the first line." },
  evidence: { rating: "some", comment: "One figure supports it; what else would a sceptic accept?" },
  steelman: { rating: "missing", comment: "The strongest opposing point is not addressed." },
  tone: { rating: "constructive", comment: "You argue with ideas." },
  questions: ["What would someone who disagrees say first?"],
};
const q = { title: "Q", kind: "argument" };
const deps = (provider: AiProvider) => ({ provider, settings: { ...DEFAULT_AI_SETTINGS }, reserve: vi.fn(async () => "ok"), record: vi.fn(async () => {}), env: {}, timeouts: { coach: 50 } }) as unknown as EngineDeps;
const answers = (...texts: (string | Error)[]): AiProvider => {
  let i = 0;
  return {
    name: "fake",
    async complete() {
      const t = texts[Math.min(i++, texts.length - 1)];
      if (t instanceof Error) throw t;
      return { text: t, inputTokens: 10, outputTokens: 5 };
    },
  };
};

async function failure(...texts: (string | Error)[]) {
  const r = await coachWith(deps(answers(...texts)), "My draft.", q, "u1");
  expect(r.ok).toBe(false);
  return r;
}

describe("coach failure diagnostics", () => {
  it("names a JSON parse error and keeps the raw text", async () => {
    const r = await failure('{"clarity": {');
    expect(r).toMatchObject({ why: "invalid_output", attempts: [{ attempt: 1, category: "json_parse", rawText: '{"clarity": {' }, { attempt: 2, category: "json_parse" }] });
  });
  it("names the failing schema field", async () => {
    const long = { ...good, clarity: { rating: "clear", comment: "x".repeat(301) } };
    const r = await failure(JSON.stringify(long));
    expect(r.attempts?.[0]).toMatchObject({ category: "schema", detail: expect.stringContaining("clarity.comment") });
  });
  it("names the validator rule and where it fired", async () => {
    const bad = { ...good, questions: ["You could write it as a question instead?"] };
    const r = await failure(JSON.stringify(bad));
    expect(r.attempts?.[0]).toMatchObject({ category: "validator", detail: expect.stringMatching(/rewrite_phrase #3 .* in questions\[0\]/) });
    expect(replacementTextRule(bad as never, "d")).toMatch(/^rewrite_phrase/);
  });
  it("names a refusal and a cut-off answer, with the stop reason", async () => {
    const refused = await failure(new ProviderStopError("The model declined to answer", "refusal", ""));
    expect(refused).toMatchObject({ why: "error", attempts: [{ category: "refusal", stopReason: "refusal" }, { category: "refusal" }] });
    const cut = await failure(new ProviderStopError("The answer was cut off", "max_tokens", '{"clarity": {"rating": "cl'));
    expect(cut.attempts?.[0]).toMatchObject({ category: "truncated", stopReason: "max_tokens", rawText: '{"clarity": {"rating": "cl' });
  });
  it("records a first failure even when the retry works, and the value is unchanged", async () => {
    const r = await coachWith(deps(answers("not json", JSON.stringify(good))), "My draft.", q, "u1");
    expect(r.ok).toBe(true);
    expect(r.attempts).toHaveLength(1);
    if (r.ok) expect(r.feedback.questions).toEqual(good.questions);
  });
  it("adds no attempts to a clean success", async () => {
    const r = await coachWith(deps(answers(JSON.stringify(good))), "My draft.", q, "u1");
    expect(r.ok && r.attempts).toBeFalsy();
  });
});

describe("weakest link status (prompt v2): omitted by the model, or dropped by our rules", () => {
  const draft = "The four-day week should become the norm because trials found sick days fell by 20%.";
  const run = (extra: Record<string, unknown>) => coachWith(deps(answers(JSON.stringify({ ...good, ...extra }))), draft, q, "u1", { promptVersion: 2 });

  it("kept: a valid sentence is shown", async () => {
    const r = await run({ weakest_link: "The steelman is missing: the strongest opposing point is not met." });
    expect(r.ok && r.weakestLink).toEqual({ status: "kept" });
    expect(r.ok && r.feedback.weakest_link).toBeTruthy();
  });
  it("omitted: the model sent none, null or an empty string", async () => {
    for (const extra of [{}, { weakest_link: null }, { weakest_link: "" }, { weakest_link: "   " }]) {
      const r = await run(extra);
      expect(r.ok && r.weakestLink).toEqual({ status: "omitted" });
      expect(r.ok && "weakest_link" in r.feedback).toBe(false);
    }
  });
  it("dropped by our rules, naming the rule and keeping the model's text", async () => {
    const two = await run({ weakest_link: "The evidence and the tone are both weak." });
    expect(two.ok && two.weakestLink).toMatchObject({ status: "dropped", reason: expect.stringMatching(/names several parts/), text: "The evidence and the tone are both weak." });
    const score = await run({ weakest_link: "The evidence would score badly." });
    expect(score.ok && score.weakestLink).toMatchObject({ status: "dropped", reason: expect.stringMatching(/scores, ranks or winning \(score\)/) });
    const fig = await run({ weakest_link: "The evidence is thin: a 2019 study is not cited." });
    expect(fig.ok && fig.weakestLink).toMatchObject({ status: "dropped", reason: expect.stringMatching(/figure that is not in the draft \(2019\)/) });
    expect(fig.ok && "weakest_link" in fig.feedback).toBe(false);
  });
  it("dropped by the schema: too long or not a string", async () => {
    const long = await run({ weakest_link: `The evidence is thin: ${"x".repeat(200)}` });
    expect(long.ok && long.weakestLink).toMatchObject({ status: "dropped", reason: expect.stringMatching(/^schema: length/) });
    const num = await run({ weakest_link: 7 });
    expect(num.ok && num.weakestLink).toMatchObject({ status: "dropped", reason: expect.stringMatching(/^schema: not a usable string/) });
  });
  it("prompt v1 reports no status", async () => {
    const r = await coachWith(deps(answers(JSON.stringify(good))), draft, q, "u1", { promptVersion: 1 });
    expect(r.ok && r.weakestLink).toBeUndefined();
  });
});
