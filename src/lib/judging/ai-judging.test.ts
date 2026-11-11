import { describe, expect, it } from "vitest";
import { judgeRationaleWith, judgeRubricWith, type EngineDeps } from "@/lib/ai/engine";
import { promptVersion } from "@/lib/ai/prompts";
import { fakeProvider } from "@/lib/ai/providers/fake";
import type { AiProvider } from "@/lib/ai/providers/types";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/types";
import { judgingEmail } from "@/lib/email/judging-templates";

function deps(over: Partial<EngineDeps> = {}): EngineDeps & { reserved: string[] } {
  const reserved: string[] = [];
  return {
    provider: fakeProvider,
    settings: { ...DEFAULT_AI_SETTINGS },
    reserve: async (feature) => {
      reserved.push(feature);
      return "ok";
    },
    record: async () => {},
    reserved,
    ...over,
  };
}

const STRONG =
  "The four-day week should become the norm because a 2023 UK trial of 61 companies found 92% kept it, and revenue held steady according to the report. " +
  "Critics argue productivity must fall; to be fair to the other side, the strongest argument against is that hospitals and schools cannot simply close on Fridays. " +
  "However, staggered rotas solve that, which means the principle still holds.";

describe("AI rubric (fake provider)", () => {
  it("scores 1-5 on the four criteria, with the prompt version and model stored, and counts against the cap", async () => {
    const d = deps();
    const r = await judgeRubricWith(d, { body: STRONG, kind: "argument", campaign: { title: "Should the four-day week become the norm?", category: "technology" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const k of ["logic", "evidence", "originality", "responsiveness"] as const) expect(r.scores[k]).toBeGreaterThanOrEqual(1);
    expect(r.scores.evidence).toBeGreaterThanOrEqual(4);
    expect(r.scores.steelman.present).toBe(true);
    expect(r.record.promptVersion).toBe(promptVersion("judge_rubric"));
    expect(r.record.model).toBe("claude-sonnet-5-5");
    expect(d.reserved).toEqual(["judge_rubric"]);
  });

  it("scores a slogan low", async () => {
    const r = await judgeRubricWith(deps(), { body: "Obviously yes. Next question!", kind: "argument", campaign: { title: "X", category: "energy" } });
    expect(r.ok && r.scores).toMatchObject({ logic: 1, evidence: 1, originality: 1, responsiveness: 1 });
  });

  it("waits, without calling the model, when the AI is over its cap", async () => {
    const r = await judgeRubricWith(deps({ reserve: async () => "global_cap" }), { body: STRONG, kind: "argument", campaign: { title: "X", category: "energy" } });
    expect(r).toMatchObject({ ok: false, why: "global_cap" });
  });

  it("discards an answer that does not validate", async () => {
    const broken: AiProvider = { name: "fake", complete: async () => ({ text: '{"logic": 9}', inputTokens: 1, outputTokens: 1 }) };
    const r = await judgeRubricWith(deps({ provider: broken }), { body: STRONG, kind: "argument", campaign: { title: "X", category: "energy" } });
    expect(r).toMatchObject({ ok: false, why: "invalid_output" });
  });
});

describe("AI rationale wording", () => {
  const template = "@{user:00000000-0000-4000-8000-000000000001} is the Grand Strategist, with a final score of 78.5 out of 100. Panel 40%.";

  it("keeps the wording when every token and number is unchanged", async () => {
    const r = await judgeRationaleWith(deps(), template);
    expect(r.ok && r.rationale).toBe(template);
  });

  it("rejects a rewording that drops a Strategist token or changes a number", async () => {
    const dropsToken: AiProvider = { name: "fake", complete: async () => ({ text: JSON.stringify({ rationale: "Ada is the Grand Strategist, with 78.5 out of 100. Panel 40%." }), inputTokens: 1, outputTokens: 1 }) };
    expect((await judgeRationaleWith(deps({ provider: dropsToken }), template)).ok).toBe(false);
    const changesNumber: AiProvider = {
      name: "fake",
      complete: async () => ({ text: JSON.stringify({ rationale: template.replace("78.5", "79") }), inputTokens: 1, outputTokens: 1 }),
    };
    expect((await judgeRationaleWith(deps({ provider: changesNumber }), template)).ok).toBe(false);
  });
});

describe("judging emails", () => {
  const who = { handle: "Ada", unsubscribeToken: "tok" };
  it("link to the right pages and respect the right preference", () => {
    const voting = judgingEmail("https://tgs.example", who, "peer_voting_open", { campaign_slug: "x", campaign_title: "Should X?", voting_closes_at: "2026-12-01T12:00:00Z" });
    expect(voting.text).toContain("https://tgs.example/campaigns/x/vote");
    expect(voting.preference).toBe("campaign_updates");
    const verdict = judgingEmail("https://tgs.example", who, "verdict_published", { campaign_slug: "x", campaign_title: "Should X?" });
    expect(verdict.subject).toBe("The Verdict: Should X?");
    expect(verdict.text).toContain("/campaigns/x/verdict");
    const appeal = judgingEmail("https://tgs.example", who, "verdict_appeal_outcome", { campaign_slug: "x", campaign_title: "X", outcome: "rejected" });
    expect(appeal.subject).toBe("Your appeal was not upheld");
    expect(appeal.preference).toBe("moderation");
    expect(judgingEmail("https://tgs.example", who, "judge_assigned", { campaign_slug: "x", campaign_title: "X" }).text).toContain("/judging");
  });
});
