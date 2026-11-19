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
