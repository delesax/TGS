import Link from "next/link";
import { formatUkShort, type DispatchKind } from "@/lib/campaigns";
import type { AiUse } from "@/lib/dispatches";
import { AiUseLabel, KindTag, PositionTag } from "./labels";
import type { PositionChoice } from "@/lib/campaigns";

export type DispatchSummary = {
  id: string;
  kind: DispatchKind;
  position: PositionChoice | null;
  body: string;
  ai_use: AiUse;
  created_at: string;
  edited_at: string | null;
  withdrawn_at: string | null;
  hidden_at: string | null;
  moderation_status: "pending" | "visible" | "held" | "removed";
  campaign: { slug: string; title: string } | null;
};

/** A compact Dispatch for the Dossier and Strategist pages, linking to its place in the thread. */
export function DispatchSummaryItem({ d }: { d: DispatchSummary }) {
  const gone = d.withdrawn_at
    ? "Withdrawn by author."
    : d.moderation_status === "removed"
      ? "Removed by a moderator."
      : d.hidden_at
        ? "Hidden by a moderator."
        : null;
  // Only the author ever receives pending or held rows (row-level security).
  const check = d.moderation_status === "pending" ? "Checking… only you can see this for now." : d.moderation_status === "held" ? "Held: a person will check this before others can see it." : null;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PositionTag position={d.position} />
        <KindTag kind={d.kind} />
        {gone ? <span className="rounded-full border-2 border-muted-foreground px-2 py-0.5 text-base font-semibold">{d.withdrawn_at ? "Withdrawn" : d.moderation_status === "removed" ? "Removed" : "Hidden"}</span> : null}
        {!gone && check ? <span className="rounded-full border-2 border-accent-foreground bg-accent px-2 py-0.5 text-base font-semibold text-accent-foreground">{d.moderation_status === "held" ? "Held" : "Checking…"}</span> : null}
      </div>
      <p className="text-base text-muted-foreground">
        <time dateTime={d.created_at}>{formatUkShort(d.created_at)}</time>
        {d.edited_at && !gone ? " · edited" : ""}
      </p>
      {!gone && check ? <p className="text-base font-semibold">{check}</p> : null}
      {gone ? <p className="text-lg italic text-muted-foreground">{gone}</p> : <p className="line-clamp-4 whitespace-pre-line text-lg [overflow-wrap:anywhere]">{d.body}</p>}
      {!gone ? <AiUseLabel aiUse={d.ai_use} /> : null}
      {d.campaign ? (
        <Link href={`/campaigns/${d.campaign.slug}#dispatch-${d.id}`} className="inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
          See it in the debate
        </Link>
      ) : null}
    </li>
  );
}

export const SUMMARY_COLUMNS = "id, kind, position, body, ai_use, created_at, edited_at, withdrawn_at, hidden_at, moderation_status, campaign:campaigns(slug, title)";
