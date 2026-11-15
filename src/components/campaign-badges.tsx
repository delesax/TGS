import { CATEGORY_LABELS, FORMAT_LABELS, type Category, type Format, type Status } from "@/lib/campaigns";

const STATUS_TEXT: Record<Status, string> = {
  draft: "Draft",
  scheduled: "Opening soon",
  open: "Open now",
  closed: "Closed",
};

const STATUS_CLASS: Record<Status, string> = {
  draft: "bg-accent text-accent-foreground",
  scheduled: "border border-gold-text/40 bg-accent text-accent-foreground",
  open: "border border-success/40 bg-success-soft text-success",
  closed: "border border-border bg-muted text-muted-foreground",
};

// A dot as well as a word, so the status never depends on colour alone.
const DOT_CLASS: Record<Status, string> = {
  draft: "bg-accent-foreground",
  scheduled: "bg-accent-foreground",
  open: "bg-success",
  closed: "bg-muted-foreground",
};

export function CampaignBadges({ status, category, format }: { status: Status; category: Category; format: Format }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="About this Campaign">
      <li className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${STATUS_CLASS[status]}`}>
        <span aria-hidden className={`size-2 rounded-full ${DOT_CLASS[status]}`} />
        {STATUS_TEXT[status]}
      </li>
      <li className="rounded-md bg-muted px-2 py-0.5 text-sm text-muted-foreground">{CATEGORY_LABELS[category]}</li>
      <li className="rounded-md bg-muted px-2 py-0.5 text-sm text-muted-foreground">{FORMAT_LABELS[format]}</li>
    </ul>
  );
}

export function OpinionNotAdvice() {
  return (
    <p role="note" className="rounded-lg border-2 border-border bg-muted p-4 text-lg">
      <strong>Opinion, not advice.</strong> Dispatches in this Campaign are personal views. They are not financial, medical or
      professional advice.
    </p>
  );
}
