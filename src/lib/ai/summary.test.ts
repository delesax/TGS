import { describe, expect, it } from "vitest";
import { SUMMARY_INPUT_MAX_CHARS, judgeSummaryWith, pickSummaryDispatches, summaryProblems, type EngineDeps } from "./engine";
import { loadPrompt, promptVersion } from "./prompts";
import { fakeProvider } from "./providers/fake";
import type { AiProvider, ProviderRequest } from "./providers/types";
import { DEFAULT_AI_SETTINGS } from "./types";

// The winner's summary ("The winning case"): the engine task and its mechanical checks. Fake provider only.

function recording(inner: AiProvider = fakeProvider): { provider: AiProvider; sent: ProviderRequest[] } {
  const sent: ProviderRequest[] = [];
  return { sent, provider: { name: "fake", async complete(req) { sent.push(req); return inner.complete(req); } } };
}
const deps = (provider: AiProvider, reserve: EngineDeps["reserve"] = async () => "ok"): EngineDeps => ({
  provider,
  settings: { ...DEFAULT_AI_SETTINGS },
  reserve,
  record: async () => {},
  env: {},
  timeouts: { judging: 45_000 },
});

const WORDS = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 7 === 0 ? "" : "s"}`).join(" ");
const D1 = "Libraries should open on Sundays because that is when working families are free. A 2023 council survey of 400 residents found demand was highest then. " + WORDS(30);
const D2 = "Staff overtime is a fair worry, so a volunteer rota could cover it. See https://example.org/report for the cost figures. " + WORDS(30);
const SOURCE = `${D1}\n\n${D2}`;
const dispatches = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "argument", body: D1 },
  { id: "22222222-2222-4222-8222-222222222222", kind: "rebuttal", body: D2, sources: [{ url: "https://example.org/report", title: "Cost report" }] },
];

describe("the judge-summary prompt", () => {
  it("is its own versioned file and states the rules", () => {
    expect(promptVersion("judge_summary")).toBe("judge-summary.v2");
    const text = loadPrompt("judge_summary").text;
    for (const rule of [/Use only what is written/, /Do not invent or alter quotations/, /Do not judge, rank, praise or criticise/, /neutral tone/i, /untrusted_text/]) expect(text).toMatch(rule);
    // The rationale prompt is untouched.
    expect(loadPrompt("judge_rationale").version).toBe("judge-rationale.v1");
  });
});

describe("summaryProblems", () => {
  const ok = WORDS(100);
  it("passes a plain summary of about 100 words", () => {
    expect(summaryProblems(ok, SOURCE)).toEqual([]);
  });
  it("rejects too short and too long", () => {
    expect(summaryProblems(WORDS(20), SOURCE)[0]).toMatch(/word count/);
    expect(summaryProblems(WORDS(200), SOURCE)[0]).toMatch(/word count/);
  });
  it("allows a quotation copied exactly, and rejects one that is not in the Dispatches", () => {
    expect(summaryProblems(`${ok} They say "that is when working families are free".`, SOURCE)).toEqual([]);
    expect(summaryProblems(`${ok} They say "nobody has ever said this".`, SOURCE).join()).toMatch(/invented quotation/);
  });
  it("rejects a figure or address the Dispatches do not contain", () => {
    expect(summaryProblems(`${ok} A 2023 survey of 400 residents.`, SOURCE)).toEqual([]);
    expect(summaryProblems(`${ok} About 7412 people agree.`, SOURCE).join()).toMatch(/number not in the Dispatches: 7412/);
    expect(summaryProblems(`${ok} See https://other.example/x.`, SOURCE).join()).toMatch(/address not in the Dispatches/);
    expect(summaryProblems(`${ok} See https://example.org/report.`, SOURCE)).toEqual([]);
  });
  it("rejects a handle or mention token", () => {
    expect(summaryProblems(`${ok} As @Someone said.`, SOURCE).join()).toMatch(/names a member/);
    expect(summaryProblems(`${ok} @{user:11111111-1111-4111-8111-111111111111}`, SOURCE).join()).toMatch(/names a member/);
  });
});

describe("pickSummaryDispatches", () => {
  it("keeps whole Dispatches, oldest first, and skips one that would pass the ceiling", () => {
    const big = { id: "big", kind: "argument", body: "x".repeat(SUMMARY_INPUT_MAX_CHARS) };
    const small = { id: "small", kind: "argument", body: "short one" };
    expect(pickSummaryDispatches([small, big, { ...small, id: "small2" }]).map((d) => d.id)).toEqual(["small", "small2"]);
  });
});

describe("judgeSummaryWith", () => {
  it("drafts from the winner's own text only, with no names or ids sent, and returns the prompt version and cost", async () => {
    const rec = recording();
    const r = await judgeSummaryWith(deps(rec.provider), { topic: "Should libraries open on Sundays?", dispatches });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.promptVersion).toBe("judge-summary.v2");
    expect(r.record.model).toBe("claude-sonnet-5-5");
    expect(r.usage.estimatedCostUsd).toBeGreaterThan(0);
    expect(r.inputDispatchIds).toEqual(dispatches.map((d) => d.id));
    expect(dispatches.map((d) => d.id)).toContain(r.bestDispatchId);
    expect(summaryProblems(r.summary, SOURCE + "\n\nSources cited: Cost report https://example.org/report")).toEqual([]);
    const sent = rec.sent[0];
    expect(sent.task).toBe("judge_summary");
    expect(sent.user).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no ids
    expect(sent.user).not.toMatch(/@/);
    expect(sent.system).toContain("winner");
  });

  it("is discarded, never partly used, when the answer invents a quotation or a figure", async () => {
    for (const marker of ["[[summary-quote]]", "[[summary-number]]"]) {
      const r = await judgeSummaryWith(deps(fakeProvider), { topic: "t", dispatches: [{ ...dispatches[0], body: `${D1} ${marker}` }] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.why).toBe("invalid_output");
    }
  });

  it("takes the fallback (no summary) when AI is off, capped, absent, failing or has no Dispatches", async () => {
    const off = await judgeSummaryWith({ ...deps(fakeProvider), settings: { ...DEFAULT_AI_SETTINGS, ai_enabled: false } }, { topic: "t", dispatches });
    expect(off).toMatchObject({ ok: false, why: "off" });
    const capped = await judgeSummaryWith(deps(fakeProvider, async () => "global_cap"), { topic: "t", dispatches });
    expect(capped).toMatchObject({ ok: false, why: "global_cap" });
    const none = await judgeSummaryWith({ ...deps(fakeProvider), provider: null }, { topic: "t", dispatches });
    expect(none).toMatchObject({ ok: false, why: "no_provider" });
    const err = await judgeSummaryWith(deps(fakeProvider), { topic: "t", dispatches: [{ ...dispatches[0], body: `${D1} [[ai-error]]` }] });
    expect(err.ok).toBe(false);
    expect(await judgeSummaryWith(deps(fakeProvider), { topic: "t", dispatches: [] })).toMatchObject({ ok: false, why: "no_dispatches" });
  });

  it("logs the spend under the existing judge_rationale feature", async () => {
    const features: string[] = [];
    const d = deps(fakeProvider, async (feature) => {
      features.push(feature);
      return "ok";
    });
    await judgeSummaryWith(d, { topic: "t", dispatches });
    expect(features).toEqual(["judge_rationale"]);
  });
});

describe("judge-summary prompt v2 (labels, motives, whose view is whose)", () => {
  const v2 = loadPrompt("judge_summary").text;
  it("keeps v1 on disk unchanged and selectable, and v2 is the default", () => {
    expect(promptVersion("judge_summary", 1)).toBe("judge-summary.v1");
    expect(loadPrompt("judge_summary", 1).text).toMatch(/Choose the one Dispatch that best sets out their case/);
    expect(loadPrompt("judge_summary", 1).text).not.toMatch(/WRONG/);
    expect(loadPrompt("judge_summary").version).toBe("judge-summary.v2");
  });
  it("forbids labels in the summary, with a wrong and a right example", () => {
    expect(v2).toMatch(/appear ONLY in the best_dispatch field/);
    expect(v2).toMatch(/WRONG: "In D1 they say/);
    expect(v2).toMatch(/RIGHT: "They say people are living longer/);
  });
  it("forbids inferred motives, intent and effects, with an example", () => {
    expect(v2).toMatch(/Do not say what the participant meant, wanted, hoped, aimed or intended/);
    expect(v2).toMatch(/aimed at easing the change/);
  });
  it("attributes a restated or steelmanned view to the other side", () => {
    expect(v2).toMatch(/That restated view belongs to the OTHER side/);
    expect(v2).toMatch(/They acknowledge the opposing view that/);
    expect(v2).toMatch(/State the participant's own position only from what they themselves assert/);
  });
  it("passes each Dispatch's type with its label", async () => {
    const rec = recording();
    await judgeSummaryWith(deps(rec.provider), { topic: "t", dispatches });
    expect(rec.sent[0].user).toContain("D1_kind: argument");
    expect(rec.sent[0].user).toContain("D2_kind: rebuttal");
  });
});

describe("summaryProblems: label leak and inferred motive", () => {
  const ok = WORDS(100);
  it("rejects a Dispatch label anywhere in the summary", () => {
    expect(summaryProblems(`${ok} In D1 they say families are free.`, SOURCE).join()).toMatch(/internal label in the summary: D1/);
    expect(summaryProblems(`${ok} D2 answers the other side.`, SOURCE).join()).toMatch(/internal label/);
    expect(summaryProblems(`${ok} See Dispatch 3 for more.`, SOURCE).join()).toMatch(/internal label/);
    expect(summaryProblems(`${ok} Their first Dispatch says families are free.`, SOURCE)).toEqual([]);
  });
  it("rejects a stated motive or intent the Dispatches do not use", () => {
    expect(summaryProblems(`${ok} They suggest a notice period, aimed at easing the change.`, SOURCE).join()).toMatch(/inferred motive or intent: aimed at/);
    expect(summaryProblems(`${ok} They want to protect families.`, SOURCE).join()).toMatch(/inferred motive or intent: want to/);
    expect(summaryProblems(`${ok} The rota is designed to cut costs.`, SOURCE).join()).toMatch(/inferred motive or intent: designed to/);
  });
  it("allows the same words when a Dispatch itself says them", () => {
    const source = `${SOURCE}\n\nThe rota is designed to cut costs.`;
    expect(summaryProblems(`${ok} The rota is designed to cut costs.`, source)).toEqual([]);
  });
});

describe("a winner who steelmans the other side (fixture)", () => {
  // The winner's own rebuttal first restates the opposing view, then asserts their own.
  const STEELMAN =
    "Restating your view to check I have it right: phones distract pupils and fuel bullying, and a ban saves teachers time. That is a fair case. " +
    "But a ban in school hours does nothing about bullying at 10pm. A pouch policy might help with the time teachers spend enforcing rules.";
  const own = "Phones should stay in pupils' bags, not be banned outright, because pupils need them for emergencies and for homework.";
  const SRC = `${own}\n\n${STEELMAN}`;
  const pad = WORDS(70);
  it("accepts a summary that attributes the restated view to the other side", () => {
    const good = `They argue that phones should not be banned outright. They acknowledge the opposing view that phones distract pupils and fuel bullying. They answer that a ban in school hours does nothing about bullying at 10pm. ${pad}`;
    expect(summaryProblems(good, SRC)).toEqual([]);
  });
  it("still applies every other check to such a summary (the validator is not loosened)", () => {
    const bad = `They argue that phones should be banned, as D2 says, to stop bullying at 11pm. ${pad}`;
    const problems = summaryProblems(bad, SRC).join();
    expect(problems).toMatch(/internal label/);
    expect(problems).toMatch(/number not in the Dispatches: 11/);
  });
  it("tells the model which Dispatch is a rebuttal, so the restatement can be attributed", async () => {
    const rec = recording();
    await judgeSummaryWith(deps(rec.provider), {
      topic: "Should phones be banned in schools?",
      dispatches: [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "argument", body: own },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", kind: "rebuttal", body: STEELMAN },
      ],
    });
    expect(rec.sent[0].user).toContain("D2_kind: rebuttal");
    expect(rec.sent[0].user).toContain("Restating your view");
  });
});
