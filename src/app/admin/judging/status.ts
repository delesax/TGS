import type { Category } from "@/lib/campaigns";

// One row of admin_judging_status(): the judging status board.
export type StatusRow = {
  campaign_id: string;
  slug: string;
  title: string;
  category: Category;
  status: string;
  ends_at: string;
  eligible_dispatches: number;
  judges_assigned: number;
  judges_submitted: number;
  peer_votes: number;
  voters: number;
  picks: number;
  steelman_confirmations: number;
  ai_scored: number;
  ai_pending: number;
  ai_failed: number;
  draft_id: string | null;
  draft_needs_attention: boolean | null;
  live_id: string | null;
  live_status: string | null;
  open_appeals: number;
  peer_window_closes_at: string;
  draft_due_at: string;
};

export function stage(r: StatusRow): string {
  if (r.status === "open") return "Open: judging starts at the close";
  if (r.live_status === "final") return "Final";
  if (r.live_status === "appealed") return `Under appeal (${r.open_appeals} open)`;
  if (r.live_status === "published") return "Published: appeal window open";
  if (r.draft_id) return r.draft_needs_attention ? "Draft: needs attention" : "Draft: ready to publish";
  return "Closed: collecting scores";
}
