import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenArenaRules, CHANGING_YOUR_MIND, describeDuration } from "./campaign-rules";
import { DEFAULT_LIMITS, type DispatchLimits } from "./dispatches";

// The rules text must say what the live limits say. A stale paragraph was copied once already; these tests are the guard.

const docsRules = (file: string) => {
  const text = readFileSync(path.join(process.cwd(), "docs/campaigns", file), "utf8");
  const heading = text.search(/^## (?:\d+\. )?(?:Proposed )?rules/im);
  if (heading < 0) throw new Error(`no rules heading in ${file}`);
  const block = /```text\n([\s\S]*?)\n```/.exec(text.slice(heading));
  if (!block) throw new Error(`no rules block in ${file}`);
  return block[1];
};

describe("describeDuration", () => {
  it("says seconds or whole minutes", () => {
    expect(describeDuration(30)).toBe("30 seconds");
    expect(describeDuration(300)).toBe("5 minutes");
    expect(describeDuration(60)).toBe("1 minute");
    expect(describeDuration(90)).toBe("90 seconds");
    expect(describeDuration(1)).toBe("1 second");
  });
});

describe("the rules template and the live limits", () => {
  it("states every live limit (the defaults: 10 Dispatches, 1,500 / 1,000 / 600 characters, 30 seconds, 5 minutes)", () => {
    const text = buildOpenArenaRules(DEFAULT_LIMITS);
    expect(text).toContain("An Argument can be up to 1,500 characters. A Rebuttal can be up to 1,000 characters. Evidence can be up to 600 characters.");
    expect(text).toContain("You can post up to 10 Dispatches in this Campaign.");
    expect(text).toContain("You can post again 30 seconds after your last Dispatch, and you can edit a Dispatch for 5 minutes after posting it.");
  });

  it("follows the limits when they change, and shows none of the old numbers", () => {
    const changed: DispatchLimits = { argument_max_chars: 2500, rebuttal_max_chars: 1200, evidence_max_chars: 700, max_dispatches_per_round: 7, cooldown_seconds: 45, edit_window_seconds: 600 };
    const text = buildOpenArenaRules(changed);
    expect(text).toContain("up to 2,500 characters");
    expect(text).toContain("up to 1,200 characters");
    expect(text).toContain("up to 700 characters");
    expect(text).toContain("up to 7 Dispatches");
    expect(text).toContain("45 seconds after");
    expect(text).toContain("10 minutes after posting");
    for (const stale of ["1,500", "1,000", "600 characters", "up to 10", "30 seconds", "5 minutes"]) expect(text).not.toContain(stale);
  });

  it("changing any one limit changes the text (so a number cannot be hard-coded)", () => {
    const base = buildOpenArenaRules(DEFAULT_LIMITS);
    for (const key of Object.keys(DEFAULT_LIMITS) as (keyof DispatchLimits)[]) {
      expect(buildOpenArenaRules({ ...DEFAULT_LIMITS, [key]: DEFAULT_LIMITS[key] + 61 })).not.toBe(base);
    }
  });

  it("keeps the corrected 'Changing your mind' paragraph", () => {
    expect(buildOpenArenaRules(DEFAULT_LIMITS)).toContain(CHANGING_YOUR_MIND);
    expect(CHANGING_YOUR_MIND).toMatch(/at least 48 hours old/);
    expect(CHANGING_YOUR_MIND).toMatch(/72-hour peer-voting window/);
    expect(CHANGING_YOUR_MIND).toMatch(/at least 24 hours/);
  });

  it("fits the Campaign form's 10,000-character rules limit", () => {
    expect(buildOpenArenaRules({ ...DEFAULT_LIMITS, argument_max_chars: 5000 }).length).toBeLessThan(10_000);
  });
});

describe("the rules text in docs/campaigns", () => {
  for (const file of ["under-16-social-media-ban.md", "vat-on-private-school-fees.md"]) {
    it(`${file} matches the template at the default limits`, () => {
      expect(docsRules(file)).toBe(buildOpenArenaRules(DEFAULT_LIMITS));
    });
  }
});
