import { z } from "zod";

// Campaign model, labels and time logic. Pure functions: every "now" is passed
// in, and it is always the server's clock (CLAUDE.md rule 5).

export const CATEGORIES = ["financial_services", "energy", "technology", "education", "health_social_care"] as const;
export const FORMATS = ["open_arena", "oxford", "progressive"] as const;
export const STATUSES = ["draft", "scheduled", "open", "closed"] as const;
export const POSITIONS = ["for", "against", "undecided"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Format = (typeof FORMATS)[number];
export type Status = (typeof STATUSES)[number];
export type PositionChoice = (typeof POSITIONS)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  financial_services: "Financial Services",
  energy: "Energy",
  technology: "Technology",
  education: "Education",
  health_social_care: "Health and Social Care",
};

export const FORMAT_LABELS: Record<Format, string> = {
  open_arena: "Open arena",
  oxford: "Oxford-style: for and against",
  progressive: "Progressive rounds",
};

export const POSITION_LABELS: Record<PositionChoice, string> = {
  for: "For",
  against: "Against",
  undecided: "Undecided",
};

export type CampaignRound = { position: number; title: string; starts_at: string; ends_at: string };

export type CampaignTimes = { status: Status; starts_at: string; ends_at: string };

/**
 * The status a Campaign has at `now`. The scheduler writes the same transition
 * to the database within the minute; this lets pages show it to the second.
 */
export function statusAt(campaign: CampaignTimes, now: number): Status {
  if (campaign.status === "draft") return "draft";
  const start = Date.parse(campaign.starts_at);
  const end = Date.parse(campaign.ends_at);
  if (now >= end) return "closed";
  if (now >= start) return "open";
  return campaign.status === "closed" ? "closed" : "scheduled";
}

/** The round running at `now`: starts are inclusive, ends exclusive. */
export function currentRound<R extends CampaignRound>(rounds: R[], now: number): R | null {
  return (
    [...rounds]
      .sort((a, b) => a.position - b.position)
      .find((r) => Date.parse(r.starts_at) <= now && now < Date.parse(r.ends_at)) ?? null
  );
}

export type ListGroup = "open" | "soon" | "closed";

export function listGroup(campaign: CampaignTimes, now: number): ListGroup | null {
  const status = statusAt(campaign, now);
  if (status === "open") return "open";
  if (status === "scheduled") return "soon";
  if (status === "closed") return "closed";
  return null;
}

export function groupCampaigns<C extends CampaignTimes>(campaigns: C[], now: number): Record<ListGroup, C[]> {
  const groups: Record<ListGroup, C[]> = { open: [], soon: [], closed: [] };
  for (const c of campaigns) {
    const g = listGroup(c, now);
    if (g) groups[g].push(c);
  }
  groups.open.sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at));
  groups.soon.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  groups.closed.sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at));
  return groups;
}

// ---------------------------------------------------------------------------
// Time display and UK local time
// ---------------------------------------------------------------------------

export const TIME_ZONE = "Europe/London";

/** For example "Tuesday 1 December 2026, 9:00am (UK time)". */
export function formatUkDateTime(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d).replace(",", "");
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d)
    .replace(" ", "")
    .toLowerCase();
  return `${date}, ${time} (UK time)`;
}

function londonParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** UTC instant -> "YYYY-MM-DDTHH:mm" in UK time, for a datetime-local input. */
export function toUkInputValue(iso: string): string {
  const p = londonParts(Date.parse(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/**
 * "YYYY-MM-DDTHH:mm" read as UK time -> ISO instant. Returns null for a time
 * that does not exist (skipped when the clocks go forward). A time that occurs
 * twice (when the clocks go back) is read as the first, BST, occurrence.
 */
export function fromUkInputValue(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // UK is UTC+0 or UTC+1. Try BST first so an ambiguous time resolves to it.
  for (const offsetHours of [1, 0]) {
    const candidate = asUtc - offsetHours * 3_600_000;
    const p = londonParts(candidate);
    if (p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi) return new Date(candidate).toISOString();
  }
  return null;
}

/** Whole seconds left until `endMs`, never below zero. */
export function secondsLeft(endMs: number, now: number): number {
  return Math.max(0, Math.ceil((endMs - now) / 1000));
}

/** "2 days 4 hours", "3 hours 12 minutes", "45 seconds": plain words for the countdown. */
export function describeDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (days > 0) return hours ? `${unit(days, "day")} ${unit(hours, "hour")}` : unit(days, "day");
  if (hours > 0) return minutes ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(hours, "hour");
  if (minutes > 0) return seconds && minutes < 10 ? `${unit(minutes, "minute")} ${unit(seconds, "second")}` : unit(minutes, "minute");
  return unit(seconds, "second");
}

/** Clock face "DD:HH:MM:SS" parts for the visual countdown. */
export function clockParts(totalSeconds: number) {
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Screen readers hear the countdown at sensible intervals rather than every
 * second: hourly while more than a day is left, every 10 minutes under a day,
 * every minute under 10 minutes, every 10 seconds under a minute.
 */
export function announcementBucket(totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;
  if (totalSeconds > 86_400) return Math.ceil(totalSeconds / 3_600) * 3_600;
  if (totalSeconds > 600) return Math.ceil(totalSeconds / 600) * 600;
  if (totalSeconds > 60) return Math.ceil(totalSeconds / 60) * 60;
  return Math.ceil(totalSeconds / 10) * 10;
}

// ---------------------------------------------------------------------------
// Admin form validation
// ---------------------------------------------------------------------------

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

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

export const MAX_ROUND_ROWS = 5;
