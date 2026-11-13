import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import { RETENTION_JOBS } from "@/lib/retention";

const md = readFileSync("docs/legal/RETENTION.md", "utf8");
const migration = readFileSync("supabase/migrations/20261107000500_retention_jobs.sql", "utf8");
const policy = renderToStaticMarkup(createElement(PrivacyPage)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function row(job: string): string[] {
  const line = md.split("\n").find((l) => l.includes(`\`${job}\``));
  if (!line) throw new Error(`${job} is not in docs/legal/RETENTION.md`);
  return line.split("|").map((c) => c.trim()).filter(Boolean);
}

describe("retention: code, RETENTION.md, the migration and the privacy policy agree", () => {
  it.each(RETENTION_JOBS)("$job", (j) => {
    const [data, period, , job, schedule] = row(j.job);
    // RETENTION.md says the same data and period as the code.
    expect(data.toLowerCase()).toBe(j.data.toLowerCase());
    expect(period).toBe(j.period);
    expect(job).toBe(`\`${j.job}\``);
    // The schedule in the document is the schedule the migration creates.
    const cron = /^`(.+)`$/.exec(schedule)![1];
    expect(migration).toContain(`cron.schedule('${j.job}', '${cron}'`);
    // Daily, off the hour.
    expect(cron).toMatch(/^\d+ \d+ \* \* \*$/);
    expect(cron.split(" ")[0]).not.toBe("0");
    // The privacy policy page says the same period next to the same data.
    if (j.inPolicy !== false) {
      const at = policy.indexOf(j.data);
      expect(at, `${j.data} is not in the policy`).toBeGreaterThan(-1);
      expect(policy.slice(at, at + j.data.length + 140), `period for ${j.data}`).toContain(j.period);
    }
  });

  it("every job in the migration is in the code list, and every scheduled job is retention-*", () => {
    const scheduled = [...migration.matchAll(/cron\.schedule\('([^']+)'/g)].map((m) => m[1]);
    expect(scheduled.sort()).toEqual(RETENTION_JOBS.map((j) => j.job).sort());
  });
});
