import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { coachWith, type EngineDeps } from "@/lib/ai/engine";
import { fakeProvider } from "@/lib/ai/providers/fake";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/types";
import { CoachFeedback } from "./ai-help";

// The server actions are not under test here; the component only imports them.
vi.mock("@/app/campaigns/[slug]/dispatch-actions", () => ({ checkTone: vi.fn(), getCoachFeedback: vi.fn(), rateCoachFeedback: vi.fn() }));

const deps = { provider: fakeProvider, settings: { ...DEFAULT_AI_SETTINGS }, reserve: async () => "ok", record: async () => {}, env: {} } as unknown as EngineDeps;
const draft = "The four-day week should become the norm because trials found sick days fell and most firms kept it, though critics doubt it works in hospitals.";
const question = { title: "Should the four-day week become the norm?", kind: "argument" };

async function render(promptVersion: number) {
  const r = await coachWith(deps, draft, question, "u1", { promptVersion });
  if (!r.ok) throw new Error(`coach failed: ${r.why}`);
  return { feedback: r.feedback, html: renderToStaticMarkup(createElement(CoachFeedback, { reply: { ok: true, decisionId: "d1", feedback: r.feedback, usesLeft: 2 } })) };
}

describe("the Weakest link line (coach prompt v2 forced on the fake provider)", () => {
  it("shows one 'Weakest link: ...' line above the four ratings", async () => {
    const { feedback, html } = await render(2);
    expect(feedback.weakest_link).toBeTruthy();
    expect(html).toContain(`Weakest link: ${feedback.weakest_link}`);
    expect(html.match(/Weakest link:/g)).toHaveLength(1);
    expect(html.indexOf("Weakest link:")).toBeLessThan(html.indexOf("Clarity of your claim"));
    expect(html).not.toContain("undefined");
  });

  it("shows no such line for prompt v1, and the rest of the feedback is unchanged", async () => {
    const v1 = await render(1);
    expect(v1.html).not.toContain("Weakest link");
    expect(v1.html).toContain("Questions to consider");
    const v2 = await render(2);
    expect(v2.html.replace(/<p class="[^"]*">Weakest link:[^<]*<\/p>/, "")).toBe(v1.html);
  });
});
