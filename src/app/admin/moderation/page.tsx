import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { REASON_LABELS, getModerationQueue, type QueueItem } from "@/lib/admin-data";
import { CATEGORY_LABELS } from "@/lib/ai/policy";
import { formatUkShort } from "@/lib/campaigns";
import { DispatchDecision, FlagDecision, HandleDecision } from "../admin-forms";
import { DecisionLogProvider } from "../decision-log";
import { AdminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

const REPORT_LABELS: Record<string, string> = {
  harassment: "Harassment or a personal attack",
  hate: "Hate towards a group",
  impersonation: "Impersonation",
  misleading: "Deliberately misleading",
  spam: "Spam or advertising",
  off_topic: "Off topic",
  other: "Something else",
};

const STATUS_WORDS: Record<string, string> = { pending: "Checking", visible: "Visible to everyone", held: "Held (author only)", removed: "Removed" };

function Item({ item, adminId }: { item: QueueItem; adminId: string }) {
  const d = item.dispatch;
  const words = item.sealedBody ?? d.body;
  const onlyAiFlag = item.reasons.every((r) => r === "undeclared_ai" || r === "unscreened");
  return (
    <li className="flex flex-col gap-3 rounded-xl border-2 border-border bg-card p-4">
      <ul className="flex flex-wrap gap-2" aria-label="Why it is here">
        {item.reasons.map((r) => (
          <li
            key={r}
            className={
              r === "held_high" || r === "appeal"
                ? "rounded-full bg-destructive px-3 py-1 text-base font-semibold text-destructive-foreground"
                : "rounded-full border-2 border-border px-3 py-1 text-base font-semibold"
            }
          >
            {REASON_LABELS[r]}
          </li>
        ))}
      </ul>
      <p className="text-base text-muted-foreground">
        @{d.author?.handle ?? "a deleted Strategist"} in{" "}
        {d.campaign ? (
          <Link href={`/campaigns/${d.campaign.slug}#dispatch-${d.id}`} className="font-semibold underline">
            {d.campaign.title}
          </Link>
        ) : (
          "a Campaign"
        )}
        {d.campaign?.is_sensitive ? " (sensitive)" : ""}, {formatUkShort(d.created_at)}. Status: {STATUS_WORDS[d.moderation_status]}
        {d.withdrawn_at ? ", withdrawn by the author" : ""}. AI use declared: {d.ai_use}.
      </p>

      {item.parent ? (
        <div className="border-l-4 border-border pl-3 text-base text-muted-foreground">
          <p className="font-semibold">Replying to @{item.parent.handle ?? "a Strategist"}:</p>
          <p className="line-clamp-3 whitespace-pre-line [overflow-wrap:anywhere]">{item.parent.body}</p>
        </div>
      ) : null}
      <blockquote className="whitespace-pre-line border-l-4 border-primary pl-3 text-lg [overflow-wrap:anywhere]">{words}</blockquote>
      {item.replies.length ? (
        <div className="flex flex-col gap-1 pl-4 text-base text-muted-foreground">
          <p className="font-semibold">Replies:</p>
          {item.replies.map((r) => (
            <p key={r.id} className="line-clamp-2 [overflow-wrap:anywhere]">
              @{r.handle ?? "a Strategist"}: {r.body}
            </p>
          ))}
        </div>
      ) : null}

      {item.decision ? (
        <div className="rounded-lg bg-muted p-3 text-base">
          <p>
            <strong>AI:</strong> {item.decision.outcome === "block" ? "hold, high priority" : item.decision.outcome}
            {item.decision.category ? ` · ${CATEGORY_LABELS[item.decision.category] ?? item.decision.category}` : ""}
            {item.decision.confidence !== null ? ` · ${Math.round(item.decision.confidence * 100)}% sure` : ""}
            {item.decision.overridden_at ? " · overridden by a person" : ""}
          </p>
          <p>{item.decision.reason}</p>
          <p className="text-muted-foreground">
            {item.decision.model}, prompt {item.decision.prompt_version}
          </p>
        </div>
      ) : d.screening === "unscreened" ? (
        <p className="rounded-lg bg-muted p-3 text-base">
          <strong>Not screened by AI</strong> (AI off, down or over its cap): {String(item.flags.find((f) => f.kind === "unscreened")?.details.why ?? "")}
        </p>
      ) : null}

      {item.flags.some((f) => f.kind === "undeclared_ai") ? (
        <p className="rounded-lg border-2 border-dashed border-border p-3 text-base">
          <strong>Possible undeclared AI text.</strong> {String(item.flags.find((f) => f.kind === "undeclared_ai")?.details.why ?? "")} Detection of AI
          writing is unreliable: never hold, remove or penalise on this signal alone, and never tell the author they used AI.
        </p>
      ) : null}

      {item.reports.length ? (
        <div>
          <p className="text-lg font-semibold">
            {item.reports.length} report{item.reports.length === 1 ? "" : "s"}
          </p>
          <ul className="flex flex-col gap-1 text-base">
            {item.reports.map((r) => (
              <li key={`${r.reporter}-${r.created_at}`}>
                @{r.reporter ?? "a Strategist"}: {REPORT_LABELS[r.reason] ?? r.reason}
                {r.details ? `, “${r.details}”` : ""} ({formatUkShort(r.created_at)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.appeal ? (
        <div className="rounded-lg border-2 border-destructive p-3 text-base">
          <p className="font-semibold">Appeal from the author ({formatUkShort(item.appeal.created_at)})</p>
          <p className="[overflow-wrap:anywhere]">“{item.appeal.reason}”</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 border-t border-border pt-3">
        <DispatchDecision
          dispatchId={d.id}
          summary={`@${d.author?.handle ?? "a deleted Strategist"}: “${words.length > 60 ? `${words.slice(0, 60).trimEnd()}…` : words}”`}
          status={d.moderation_status}
          hasReports={item.reports.length > 0}
          sameAdminWarning={Boolean(item.appeal?.original_actor && item.appeal.original_actor === adminId)}
        />
        {onlyAiFlag && d.moderation_status === "visible"
          ? item.flags.map((f) => (
              <details key={f.id} className="rounded-lg border border-border p-3">
                <summary className="min-h-12 cursor-pointer py-2 text-lg font-semibold">Or close the “{REASON_LABELS[f.kind as "unscreened"]}” flag with no change</summary>
                <FlagDecision flagId={f.id} summary={`Flag on @${d.author?.handle ?? "a deleted Strategist"}’s Dispatch`} />
              </details>
            ))
          : null}
      </div>
    </li>
  );
}

export default async function ModerationPage() {
  const viewer = await requireAdmin("/admin/moderation");
  const { items, handles } = await getModerationQueue();
  return (
    <Page
      title="Moderation"
      intro="Held Dispatches, appeals, reports and anything the AI could not check, most severe and newest first. Every decision needs a reason and is audit-logged; the author is told the outcome in plain words."
    >
      <AdminNav current="/admin/moderation" />
      <DecisionLogProvider>
      <section aria-labelledby="dispatches-h" className="flex flex-col gap-4">
        <h2 id="dispatches-h" className="text-2xl font-bold">
          Dispatches ({items.length})
        </h2>
        {items.length ? (
          <ul className="flex flex-col gap-4">
            {items.map((item) => (
              <Item key={item.dispatch.id} item={item} adminId={viewer.userId} />
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing waiting">Held, reported and appealed Dispatches appear here.</EmptyState>
        )}
      </section>

      <section aria-labelledby="handles-h" className="flex flex-col gap-4">
        <h2 id="handles-h" className="text-2xl font-bold">
          Handles ({handles.length})
        </h2>
        {handles.length ? (
          <ul className="flex flex-col gap-4">
            {handles.map((h) => (
              <li key={h.flagId} className="flex flex-col gap-3 rounded-xl border-2 border-border bg-card p-4">
                <p className="text-xl font-semibold [overflow-wrap:anywhere]">@{h.handle}</p>
                <p className="text-base text-muted-foreground">
                  {h.kind === "held_handle"
                    ? `Held by the AI: ${h.reason ?? "no reason given"}.`
                    : "Accepted while the AI was unavailable (deny-list only). In use now."}{" "}
                  Asked {formatUkShort(h.created_at)}.
                </p>
                {h.kind === "held_handle" ? <HandleDecision flagId={h.flagId} summary={`Handle @${h.handle}`} /> : <FlagDecision flagId={h.flagId} summary={`Handle @${h.handle}`} />}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No handles waiting">Handles the AI did not allow wait here for a person.</EmptyState>
        )}
      </section>
      </DecisionLogProvider>
    </Page>
  );
}
