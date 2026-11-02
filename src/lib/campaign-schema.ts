import { z } from "zod";
import { CATEGORIES, DISPATCH_KINDS, FORMATS, SLUG_PATTERN, fromUkInputValue } from "./campaigns";

// Admin form validation for Campaigns. Kept apart from campaigns.ts so the
// validation library is not sent to every visitor's browser.

const ukTime = (label: string) =>
  z
    .string()
    .min(1, `Enter the ${label}.`)
    .transform((v, ctx) => {
      const iso = fromUkInputValue(v);
      if (!iso) {
        ctx.addIssue({ code: "custom", message: `Enter the ${label} as a date and time. This time may not exist because the clocks change.` });
        return z.NEVER;
      }
      return iso;
    });

export const roundInputSchema = z.object({
  title: z.string().trim().min(1, "Give the round a name, for example Opening arguments.").max(80, "Keep the round name to 80 characters or fewer."),
  startsAt: ukTime("round start"),
  endsAt: ukTime("round end"),
  allowedKinds: z.array(z.enum(DISPATCH_KINDS)).min(1, "Each round must accept at least one kind of Dispatch.").default([...DISPATCH_KINDS]),
});

export const campaignInputSchema = z
  .object({
    title: z.string().trim().min(5, "The title needs at least 5 characters.").max(160, "Keep the title to 160 characters or fewer."),
    slug: z
      .string()
      .trim()
      .max(80, "Keep the web address to 80 characters or fewer.")
      .regex(SLUG_PATTERN, "Use lower-case letters, numbers and single hyphens only, for example four-day-week."),
    summary: z.string().trim().min(1, "Write a short summary so people know what the question is about.").max(2000, "Keep the summary to 2,000 characters or fewer."),
    rules: z.string().trim().max(10000, "Keep the rules to 10,000 characters or fewer."),
    category: z.enum(CATEGORIES, "Choose a category."),
    format: z.enum(FORMATS, "Choose a format."),
    status: z.enum(["draft", "scheduled"], "Choose whether to keep this as a draft or schedule it."),
    startsAt: ukTime("start date and time"),
    endsAt: ukTime("end date and time"),
    isSensitive: z.boolean(),
    contentNote: z.string().trim().max(500, "Keep the content note to 500 characters or fewer."),
    opinionNotAdvice: z.boolean(),
    notes: z.string().trim().max(2000, "Keep the notes to 2,000 characters or fewer."),
    rounds: z.array(roundInputSchema).max(10, "A Campaign can have at most 10 rounds."),
  })
  .superRefine((v, ctx) => {
    if (Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start." });
    }
    if (v.isSensitive && !v.contentNote) {
      ctx.addIssue({ code: "custom", path: ["contentNote"], message: "A sensitive Campaign needs a content note. It is shown before anything else." });
    }
    v.rounds.forEach((r, i) => {
      const n = i + 1;
      if (Date.parse(r.endsAt) <= Date.parse(r.startsAt)) {
        ctx.addIssue({ code: "custom", path: [`round${n}`], message: `Round ${n} must end after it starts.` });
      } else if (Date.parse(r.startsAt) < Date.parse(v.startsAt) || Date.parse(r.endsAt) > Date.parse(v.endsAt)) {
        ctx.addIssue({ code: "custom", path: [`round${n}`], message: `Round ${n} must start and end within the Campaign's start and end.` });
      } else if (i > 0 && Date.parse(r.startsAt) < Date.parse(v.rounds[i - 1].endsAt)) {
        ctx.addIssue({ code: "custom", path: [`round${n}`], message: `Round ${n} must not start before round ${i} ends.` });
      }
    });
  });

export type CampaignInput = z.infer<typeof campaignInputSchema>;
