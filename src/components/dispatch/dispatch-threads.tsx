"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Flag, Pencil, Reply, Undo2 } from "lucide-react";
import { loadMoreThreads, reportDispatch, toggleReaction, withdrawDispatch } from "@/app/campaigns/[slug]/dispatch-actions";
import { ActionForm, FormMessage, SubmitButton, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServerNow } from "@/components/use-server-now";
import { formatUkShort, type DispatchKind } from "@/lib/campaigns";
import { buildThreads, countReplies, editSecondsLeft, type DispatchLimits, type DispatchRow, type ThreadNode } from "@/lib/dispatches";
import { cn } from "@/lib/utils";
import { ComposeForm } from "./compose-form";
import { AiUseLabel, KindTag, POSITION_BORDER, PositionTag, SourceList } from "./labels";

export type ReactionType = { key: string; label: string; description: string };

export type ThreadsContext = {
  campaignId: string;
  slug: string;
  /** Open by server time: replies, edits, withdrawals and reactions are allowed. */
  open: boolean;
  /** The current round accepts rebuttals. */
  repliesAllowed: boolean;
  opinionNotAdvice: boolean;
  viewerId: string | null;
  /** Signed in with a handle. */
  canInteract: boolean;
  limits: DispatchLimits;
  reactionTypes: ReactionType[];
  serverNow: number;
};

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: "harassment", label: "Harassment or a personal attack" },
  { value: "hate", label: "Hate towards a group of people" },
  { value: "impersonation", label: "Pretending to be someone else" },
  { value: "misleading", label: "Deliberately misleading" },
  { value: "spam", label: "Spam or advertising" },
  { value: "off_topic", label: "Off topic" },
  { value: "other", label: "Something else" },
];

const Ctx = React.createContext<{ ctx: ThreadsContext; now: number; mine: Record<string, string[]>; setMine: React.Dispatch<React.SetStateAction<Record<string, string[]>>> } | null>(null);

function useThreads() {
  const value = React.useContext(Ctx);
  if (!value) throw new Error("DispatchThreads context missing");
  return value;
}

/** Polls gently for new Dispatches while the tab is visible, and on focus. */
function useNewCount(campaignId: string, since: string, viewerId: string | null): number {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/new-dispatches?since=${encodeURIComponent(since)}`, { cache: "no-store" });
        if (!res.ok) return;
        const { count: n } = (await res.json()) as { count: number };
        if (!stopped) setCount(n);
      } catch {
        // Offline or a blip: try again next time.
      }
    };
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [campaignId, since, viewerId]);
  return count;
}

export function DispatchThreads({
  context,
  initialRows,
  initialNextBefore,
  initialMine,
  since,
}: {
  context: ThreadsContext;
  initialRows: DispatchRow[];
  initialNextBefore: string | null;
  initialMine: Record<string, string[]>;
  /** Server time when this page was rendered: newer Dispatches count as new. */
  since: string;
}) {
  const router = useRouter();
  const now = useServerNow(context.serverNow);
  const [rows, setRows] = React.useState(initialRows);
  const [nextBefore, setNextBefore] = React.useState(initialNextBefore);
  const [mine, setMine] = React.useState(initialMine);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [refreshing, startRefresh] = React.useTransition();
  const newCount = useNewCount(context.campaignId, since, context.viewerId);
  const threads = React.useMemo(() => buildThreads(rows), [rows]);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  // Marks the threads as interactive (used by the performance test).
  const readyRef = React.useCallback((node: HTMLDivElement | null) => node?.setAttribute("data-hydrated", "true"), []);

  const showMore = async () => {
    if (!nextBefore) return;
    setLoading(true);
    setLoadError(null);
    const result = await loadMoreThreads(context.campaignId, nextBefore);
    setLoading(false);
    if ("error" in result) {
      setLoadError(result.error);
      return;
    }
    setRows((r) => [...r, ...result.rows]);
    setMine((m) => ({ ...m, ...result.myReactions }));
    setNextBefore(result.nextBefore);
  };

  return (
    <Ctx.Provider value={{ ctx: context, now, mine, setMine }}>
      <div ref={readyRef} data-testid="dispatch-threads" className="flex flex-col gap-4">
        <h3 ref={headingRef} tabIndex={-1} className="sr-only">
          Dispatches, newest threads first
        </h3>
        {newCount > 0 ? (
          <div className="sticky top-2 z-10 flex justify-center">
            <Button
              type="button"
              className="rounded-full shadow-lg"
              onClick={() =>
                startRefresh(() => {
                  router.refresh();
                  headingRef.current?.focus();
                })
              }
            >
              {refreshing ? "Loading…" : `${newCount} new Dispatch${newCount === 1 ? "" : "es"}. Show`}
            </Button>
          </div>
        ) : null}

        {threads.length ? (
          <ol className="flex flex-col gap-4" aria-label="Threads">
            {threads.map((node) => (
              <li key={node.id}>
                <DispatchNode node={node} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-border bg-muted p-6">
            <p className="text-2xl font-semibold">No Dispatches yet</p>
            <p className="text-lg text-muted-foreground">
              {context.open ? "Be the first to make the case. Your Dispatch will appear here." : "Nothing was posted in this Campaign."}
            </p>
          </div>
        )}

        {loadError ? (
          <p role="alert" className="rounded-lg border-2 border-destructive p-3 text-lg font-semibold text-destructive">
            {loadError}
          </p>
        ) : null}
        {nextBefore ? (
          <Button type="button" variant="outline" size="full" onClick={showMore} disabled={loading}>
            {loading ? "Loading…" : "Show more Dispatches"}
          </Button>
        ) : threads.length ? (
          <p className="text-base text-muted-foreground">You have reached the first Dispatch in this Campaign.</p>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}

function DispatchNode({ node }: { node: ThreadNode }) {
  const replies = countReplies(node);
  // Deeper branches start folded on small screens; the top two levels are open.
  const [expanded, setExpanded] = React.useState(node.depth < 2);
  return (
    <article
      id={`dispatch-${node.id}`}
      aria-labelledby={`dispatch-${node.id}-by`}
      className={cn("flex flex-col gap-3", node.depth > 0 && "border-l-2 border-border pl-3 sm:pl-4")}
    >
      <DispatchCard node={node} />
      {node.children.length ? (
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="ghost"
            className="self-start px-2"
            aria-expanded={expanded}
            aria-controls={`replies-${node.id}`}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
            {expanded ? "Hide" : "Show"} {replies} repl{replies === 1 ? "y" : "ies"}
          </Button>
          <ol id={`replies-${node.id}`} hidden={!expanded} className="flex flex-col gap-3">
            {node.children.map((child) => (
              <li key={child.id}>
                <DispatchNode node={child} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </article>
  );
}

function DispatchCard({ node }: { node: ThreadNode }) {
  const { ctx, now } = useThreads();
  const [panel, setPanel] = React.useState<"none" | "reply" | "edit" | "withdraw" | "report">("none");
  const isMine = ctx.viewerId === node.author_id;
  const gone = Boolean(node.withdrawn_at || node.hidden_at);
  const editLeft = isMine && !gone && ctx.open ? editSecondsLeft(node.created_at, now, ctx.limits) : 0;
  const handle = node.author?.handle;

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4", node.position ? POSITION_BORDER[node.position] : null)}>
      <header className="flex flex-col gap-2">
        <p id={`dispatch-${node.id}-by`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg">
          {handle ? (
            <Link href={`/strategists/${handle}`} className="font-semibold text-primary underline underline-offset-2">
              @{handle}
            </Link>
          ) : (
            <span className="font-semibold">A Strategist</span>
          )}
          {isMine ? <span className="text-base text-muted-foreground">(you)</span> : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PositionTag position={node.position} />
          <KindTag kind={node.kind as DispatchKind} />
          {node.round_position ? <span className="text-base text-muted-foreground">Round {node.round_position}</span> : null}
        </div>
        <p className="text-base text-muted-foreground">
          <time dateTime={node.created_at}>{formatUkShort(node.created_at)}</time>
          {node.edited_at && !gone ? " · edited" : ""}
        </p>
        {node.replyingTo ? (
          <p className="text-base">
            Replying to{" "}
            <a href={`#dispatch-${node.replyingTo.id}`} className="font-semibold underline">
              @{node.replyingTo.handle ?? "a Strategist"}
            </a>
          </p>
        ) : null}
      </header>

      {node.withdrawn_at ? (
        <p className="text-lg italic text-muted-foreground">Withdrawn by author.</p>
      ) : node.hidden_at ? (
        <p className="text-lg italic text-muted-foreground">Hidden by a moderator.</p>
      ) : (
        <>
          <p className="whitespace-pre-line break-words text-lg">{node.body}</p>
          <SourceList sources={node.sources} />
          <AiUseLabel aiUse={node.ai_use} />
          {ctx.opinionNotAdvice ? <p className="text-base font-semibold">Opinion, not advice.</p> : null}
        </>
      )}

      {!gone ? <Reactions node={node} isMine={isMine} /> : null}

      {!gone && ctx.canInteract ? (
        <div className="flex flex-wrap gap-2">
          {ctx.open && ctx.repliesAllowed ? (
            <Button type="button" variant="outline" aria-expanded={panel === "reply"} onClick={() => setPanel(panel === "reply" ? "none" : "reply")}>
              <Reply aria-hidden /> Reply
            </Button>
          ) : null}
          {editLeft > 0 ? (
            <Button type="button" variant="ghost" aria-expanded={panel === "edit"} onClick={() => setPanel(panel === "edit" ? "none" : "edit")}>
              <Pencil aria-hidden /> Edit <span className="text-base font-normal">({Math.ceil(editLeft / 60)} min left)</span>
            </Button>
          ) : null}
          {isMine && ctx.open ? (
            <Button type="button" variant="ghost" aria-expanded={panel === "withdraw"} onClick={() => setPanel(panel === "withdraw" ? "none" : "withdraw")}>
              <Undo2 aria-hidden /> Withdraw
            </Button>
          ) : null}
          {!isMine ? (
            <Button type="button" variant="ghost" aria-expanded={panel === "report"} onClick={() => setPanel(panel === "report" ? "none" : "report")}>
              <Flag aria-hidden /> Report
            </Button>
          ) : null}
        </div>
      ) : null}

      {panel === "reply" ? (
        <div className="rounded-lg border-2 border-primary p-3">
          <ComposeForm
            campaignId={ctx.campaignId}
            slug={ctx.slug}
            limits={ctx.limits}
            kinds={["rebuttal"]}
            replyTo={{ id: node.id, handle: handle ?? null }}
            opinionNotAdvice={ctx.opinionNotAdvice}
            onDone={() => setPanel("none")}
            onCancel={() => setPanel("none")}
          />
        </div>
      ) : null}
      {panel === "edit" ? (
        <div className="rounded-lg border-2 border-primary p-3">
          <ComposeForm
            campaignId={ctx.campaignId}
            slug={ctx.slug}
            limits={ctx.limits}
            kinds={[node.kind as DispatchKind]}
            editing={{ id: node.id, kind: node.kind as DispatchKind, body: node.body, aiUse: node.ai_use, sources: node.sources, parentId: node.parent_id }}
            onDone={() => setPanel("none")}
            onCancel={() => setPanel("none")}
          />
        </div>
      ) : null}
      {panel === "withdraw" ? <WithdrawPanel id={node.id} onCancel={() => setPanel("none")} /> : null}
      {panel === "report" ? <ReportPanel id={node.id} onCancel={() => setPanel("none")} /> : null}
    </div>
  );
}

function Reactions({ node, isMine }: { node: ThreadNode; isMine: boolean }) {
  const { ctx, mine, setMine } = useThreads();
  const [counts, setCounts] = React.useState(node.reaction_counts);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const active = ctx.open && ctx.canInteract && !isMine;
  const shown = ctx.reactionTypes.filter((t) => active || (counts[t.key] ?? 0) > 0);
  if (!shown.length) return null;

  const toggle = async (key: string) => {
    const was = (mine[node.id] ?? []).includes(key);
    // Optimistic: flip now, put it back if the server says no.
    const apply = (on: boolean) => {
      setMine((m) => ({ ...m, [node.id]: on ? [...(m[node.id] ?? []).filter((k) => k !== key), key] : (m[node.id] ?? []).filter((k) => k !== key) }));
      setCounts((c) => ({ ...c, [key]: Math.max(0, (c[key] ?? 0) + (on ? 1 : -1)) }));
    };
    setBusy(key);
    setMessage(null);
    apply(!was);
    const result = await toggleReaction(node.id, key);
    setBusy(null);
    if (!result.ok) {
      apply(was);
      setMessage(result.message);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2" aria-label="Reactions">
        {shown.map((t) => {
          const n = counts[t.key] ?? 0;
          const pressed = (mine[node.id] ?? []).includes(t.key);
          return (
            <li key={t.key}>
              {active ? (
                <button
                  type="button"
                  aria-pressed={pressed}
                  title={t.description}
                  disabled={busy === t.key}
                  onClick={() => toggle(t.key)}
                  className={cn(
                    "inline-flex min-h-12 items-center gap-1.5 rounded-full border-2 px-3 text-base font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    pressed ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {pressed ? <span aria-hidden>✓</span> : null}
                  {t.label}
                  <span className="tabular-nums">{n}</span>
                  <span className="sr-only">{n === 1 ? "reaction" : "reactions"}</span>
                </button>
              ) : (
                <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-base">
                  {t.label} <span className="tabular-nums font-semibold">{n}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {message ? (
        <p role="alert" className="flex items-center gap-2 text-base font-semibold text-destructive">
          {message}
          <Button type="button" variant="ghost" className="min-h-10 px-2 text-base" onClick={() => setMessage(null)}>
            Dismiss
          </Button>
        </p>
      ) : null}
    </div>
  );
}

function WithdrawPanel({ id, onCancel }: { id: string; onCancel: () => void }) {
  const { ctx } = useThreads();
  const router = useRouter();
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <div role="group" aria-label="Withdraw this Dispatch" className="flex flex-col gap-3 rounded-lg border-2 border-destructive p-3">
      <p className="text-lg">
        <strong>Withdraw this Dispatch?</strong> Others will see “Withdrawn by author” instead of your text. The judges and the audit record keep the
        original, so it is not deleted. This cannot be undone.
      </p>
      {error ? (
        <p role="alert" className="text-base font-semibold text-destructive">
          {error.message} {error.hint}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await withdrawDispatch(id, ctx.slug);
              if (result.ok) router.refresh();
              else setError(result);
            })
          }
        >
          {pending ? "Withdrawing…" : "Yes, withdraw it"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

function ReportPanel({ id, onCancel }: { id: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState(reportDispatch, {} as FormState);
  const errors = state.fieldErrors ?? {};
  return (
    <div className="rounded-lg border-2 border-border p-3">
      <ActionForm action={action} aria-label="Report this Dispatch" className="gap-4">
        <FormMessage state={state} />
        <input type="hidden" name="dispatchId" value={id} />
        <p className="text-base text-muted-foreground">
          Reports go to the TGS team, who can hide a Dispatch while they review it. During this closed test there is no automatic screening yet, so your
          report matters.
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-lg font-semibold">Why are you reporting it?</legend>
          {errors.reason ? <p className="text-base font-semibold text-destructive">{errors.reason}</p> : null}
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex min-h-12 cursor-pointer items-center gap-3 text-lg">
              <input type="radio" name="reason" value={r.value} className="size-6 shrink-0 accent-primary" />
              {r.label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`report-${id}-details`}>Anything else we should know? (optional)</Label>
          <Textarea id={`report-${id}-details`} name="details" rows={3} maxLength={500} />
        </div>
        {state.success ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Close
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton pending={pending} pendingLabel="Sending…">
              Send report
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </ActionForm>
    </div>
  );
}
