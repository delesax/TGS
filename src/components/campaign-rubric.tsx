import { formatUkDateTime } from "@/lib/campaigns";
import { BLEND_PARTS, RUBRIC_CRITERIA, type PublishedRubric } from "@/lib/judging/rubric";

/** How a Campaign is judged. Shown on the public Campaign page once an admin has published the rubric. */
export function CampaignRubric({ rubric }: { rubric: PublishedRubric }) {
  return (
    <section aria-labelledby="rubric-h" className="flex flex-col gap-4 rounded-xl border-2 border-border p-5">
      <div className="flex flex-col gap-1">
        <h2 id="rubric-h" className="text-2xl font-bold">
          How this Campaign is judged
        </h2>
        <p className="text-base text-muted-foreground">Published {formatUkDateTime(rubric.publishedAt)}, before the Campaign opens. It does not change once the Campaign is running.</p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold">The four criteria (each scored 1 to 5)</h3>
        <ul className="flex flex-col gap-2 text-lg">
          {RUBRIC_CRITERIA.map((c) => (
            <li key={c.key}>
              <strong>{c.label}.</strong> {c.text}
            </li>
          ))}
        </ul>
        {rubric.steelmanBonusMax ? (
          <p className="text-lg">
            <strong>Steelman bonus.</strong> A Dispatch that fairly restates the opposing view at its strongest before answering it can earn a bonus of up to {rubric.steelmanBonusMax} points.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold">How the Verdict is put together</h3>
        <ul className="flex flex-col gap-2 text-lg">
          {BLEND_PARTS.map((p) => (
            <li key={p.key}>
              <strong>
                {p.label}
                {rubric.weights ? `: ${rubric.weights[p.key]}%` : ""}.
              </strong>{" "}
              {p.text}
            </li>
          ))}
        </ul>
        <p className="text-base text-muted-foreground">An admin reviews every Verdict before it is published, and every Verdict can be appealed.</p>
      </div>
    </section>
  );
}
