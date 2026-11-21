import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineDeps } from "@/lib/ai/engine";
import type { AiProvider } from "@/lib/ai/providers/types";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/types";

// docs/CAMPAIGN_DRAFT_HELPER_SPEC.md, "Nothing is logged": whatever the model returns or throws, the notes and the draft reach no
// console method and no database write. The only write is the usage counter, which carries counts and token totals and nothing else.

// The sentinel is in the notes; the figure appears only in what the model returns (an invalid figure, which the validator rejects).
const SENTINEL = "ZQXSENTINELQWERTY";
const FIGURE = "7355608";
const ADMIN = "6f8f6b1e-6d0a-4a3c-9a55-0d6a3a2f1c11";
const CAMPAIGN = "0f1c9a4e-5f7d-4e5b-8d3a-2a2b9a1c7d10";

const writes: unknown[][] = [];
const state = { provider: null as AiProvider | null };

vi.mock("@/lib/auth", () => ({ getViewer: async () => ({ userId: ADMIN, isAdmin: true, profile: { handle: "admin" } }) }));
vi.mock("@/lib/campaign-data", () => ({ getCampaign: async () => ({ id: CAMPAIGN, title: "Should the Example Council close three libraries?" }) }));
vi.mock("@/lib/rate-limit", () => ({ hashSubject: (s: string) => `hash-of-${s.length}`, withinLimit: async (...a: unknown[]) => (writes.push(["rate_limit", ...a]), true) }));
// Any use of the service-role client in this path would be a database write: record it, and fail the test below.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => new Proxy({}, { get: (_t, prop) => (...a: unknown[]) => (writes.push(["supabase", String(prop), ...a]), {}) }) }));
vi.mock("@/lib/ai", () => ({
  aiEngineDeps: async (): Promise<EngineDeps> => ({
    provider: state.provider,
    settings: { ...DEFAULT_AI_SETTINGS },
    reserve: async (feature, userId) => (writes.push(["reserve", feature, userId]), "ok"),
    record: async (feature, userId, inputTokens, outputTokens, failed) => void writes.push(["record", feature, userId, inputTokens, outputTokens, failed]),
    env: {},
    timeouts: { screening: 200, nudge: 200, coach: 200, judging: 200 } as unknown as EngineDeps["timeouts"],
  }),
}));

const NOTES = `The Example Council announced a plan on 12 March 2026 to close three libraries by 1 April 2027. ${SENTINEL} appears in these notes as a reference code. Supporters argue the money is better spent on social care and critics argue the libraries serve people with nowhere else to go.`;

const consoleMethods = ["log", "info", "warn", "error", "debug", "trace"] as const;
let spies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  writes.length = 0;
  spies = consoleMethods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => vi.restoreAllMocks());

const scripted = (complete: AiProvider["complete"]): AiProvider => ({ name: "fake", complete });
const draftWith = (extra: string) => ({
  summary: `The Example Council announced a plan on 12 March 2026 to close three libraries by 1 April 2027. Supporters argue the money is better spent on social care and critics argue the libraries serve people with nowhere else to go.${extra}`,
  claims: [{ claim: "Plan announced", source_line: "The Example Council announced a plan on 12 March 2026 to close three libraries by 1 April 2027.", exact_quote: "announced a plan on 12 March 2026", status: "unverified" }],
  recheck_lines: [],
});

async function run() {
  const { draftCampaignText } = await import("./actions");
  const fd = new FormData();
  fd.set("campaignId", CAMPAIGN);
  fd.set("notes", NOTES);
  return draftCampaignText({}, fd);
}

function expectNothingLogged() {
  const everything = JSON.stringify([...spies.flatMap((s) => s.mock.calls), writes]);
  expect(everything).not.toContain(SENTINEL);
  expect(everything).not.toContain(FIGURE);
  // The only writes: the rate counter and the engine's usage counter. Never the service-role client.
  expect(writes.filter((w) => w[0] === "supabase")).toEqual([]);
  expect(new Set(writes.map((w) => w[0]))).toEqual(new Set(["rate_limit", "reserve", "record"]));
  for (const w of writes.filter((x) => x[0] === "record")) expect(w.slice(1).every((v) => typeof v !== "object" || v === null)).toBe(true);
}

describe("the draft helper writes no part of the notes or the draft anywhere", () => {
  it("(a) an invalid draft containing the sentinel as a figure: nothing is logged, and the message names only the figure", async () => {
    state.provider = scripted(async () => ({ text: JSON.stringify(draftWith(` The plan would save £${FIGURE}.`)), inputTokens: 10, outputTokens: 5 }));
    const r = await run();
    expect(r.draft).toBeUndefined();
    expect(r.formError).toMatch(/did not pass the checks/);
    // The on-screen reason may name the rejected figure and nothing longer; it never carries a line of the notes or the draft.
    expect(r.formHint ?? "").not.toContain(SENTINEL);
    expect((r.formHint ?? "").length).toBeLessThan(140);
    expectNothingLogged();
  });

  it("(b) broken JSON containing the sentinel: nothing is logged and the result carries none of it", async () => {
    state.provider = scripted(async () => ({ text: `{"summary": "${SENTINEL} ${FIGURE}`, inputTokens: 10, outputTokens: 5 }));
    const r = await run();
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    expect(JSON.stringify(r)).not.toContain(FIGURE);
    expectNothingLogged();
  });

  it("(c) a provider that throws an error whose message contains the sentinel: caught, nothing logged, nothing shown", async () => {
    state.provider = scripted(async () => {
      throw new Error(`upstream failed for ${SENTINEL} ${FIGURE}`);
    });
    const r = await run();
    expect(r.formError).toBeTruthy();
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    expectNothingLogged();
  });

  it("(d) a valid draft: shown to the admin, and still logged nowhere", async () => {
    state.provider = scripted(async () => ({ text: JSON.stringify(draftWith("")), inputTokens: 10, outputTokens: 5 }));
    const r = await run();
    expect(r.draft?.summary).toContain("Example Council");
    expect(r.success).toMatch(/Draft ready/);
    expectNothingLogged();
  });
});
