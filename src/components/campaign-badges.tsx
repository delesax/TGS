import { CATEGORY_LABELS, FORMAT_LABELS, type Category, type Format, type Status } from "@/lib/campaigns";

const STATUS_TEXT: Record<Status, string> = {
  draft: "Draft",
  scheduled: "Opening soon",
  open: "Open now",
  closed: "Closed",
};

const STATUS_CLASS: Record<Status, string> = {
  draft: "bg-accent text-accent-foreground",
  scheduled: "bg-muted text-foreground border border-border",
  open: "bg-primary text-primary-foreground",
  closed: "bg-muted text-muted-foreground border border-border",
};

export function CampaignBadges({ status, category, format }: { status: Status; category: Category; format: Format }) {
  return (
    <ul className="flex flex-wrap gap-2 text-base" aria-label="About this Campaign">
      <li className={`rounded-full px-3 py-1 font-semibold ${STATUS_CLASS[status]}`}>{STATUS_TEXT[status]}</li>
      <li className="rounded-full border border-border px-3 py-1">{CATEGORY_LABELS[category]}</li>
      <li className="rounded-full border border-border px-3 py-1">{FORMAT_LABELS[format]}</li>
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
