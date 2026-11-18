"use client";

import * as React from "react";
import { useActionState } from "react";
import { FormMessage, SubmitButton, TextAreaField, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { formatUkShort } from "@/lib/campaigns";
import { inviteMessage, parseEmailList, splitBySendDay, type Budget } from "@/lib/join-requests";
import { decideRequests, reissueInviteAction, revokeInviteAction, type InviteActionState } from "./actions";

export type PendingRequest = { id: string; email: string; note: string | null; source: string; created_at: string };

/**
 * One key per attempt. The same key goes with a repeated click or a retry of the same attempt, and the server accepts a key
 * once, so a double submit makes one batch. The key is dropped as soon as the screen shows a new result.
 */
function useBatchKey(state: InviteActionState): () => string {
  const ref = React.useRef<string | null>(null);
  React.useEffect(() => {
    ref.current = null;
  }, [state]);
  return () => (ref.current ??= crypto.randomUUID());
}

/** Sends the form including the button that was pressed (the shared ActionForm leaves that out), and the batch key. */
function submitWith(event: React.FormEvent<HTMLFormElement>, action: (data: FormData) => void, getKey?: () => string) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  if (submitter?.name) data.set(submitter.name, submitter.value);
  if (getKey) data.set("key", getKey());
  React.startTransition(() => action(data));
}

/** Copies text to the clipboard and says so. Says nothing false: the label only changes if the copy worked. */
function CopyButton({ text, label, what }: { text: string; label: string; what: string }) {
  const [done, setDone] = React.useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone("copied");
    } catch {
      setDone("failed");
    }
    window.setTimeout(() => setDone("idle"), 3000);
  };
  return (
    <>
      <Button type="button" variant="outline" onClick={copy}>
        {label}
      </Button>
      <span role="status" className="text-base">
        {done === "copied" ? `${what} copied.` : done === "failed" ? "Could not copy. Select the link and copy it by hand." : ""}
      </span>
    </>
  );
}

function Result({ state, expiryDays }: { state: InviteActionState; expiryDays?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <FormMessage state={state as FormState} />
      {state.lines?.length ? (
        <ul className="list-disc pl-6 text-base" aria-label="Details">
          {state.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      {state.links?.length ? (
        <div className="rounded-[12px] border-2 border-primary p-4" role="region" aria-label="Invite links, shown once">
          <p className="font-semibold">Invite links (shown once, not stored)</p>
          <ul className="mt-2 flex flex-col gap-2 break-all text-base">
            {state.links.map((l) => (
              <li key={l.link}>
                <span className="font-semibold">{l.email}</span>
                <br />
                <code data-testid="invite-link">{l.link}</code>
                <span className="mt-2 flex flex-wrap items-center gap-2 break-normal">
                  <CopyButton text={l.link} label="Copy link" what="Link" />
                  <CopyButton text={inviteMessage(l.link, expiryDays)} label="Copy invite message" what="Message" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function BudgetPanel({ budget }: { budget: Budget }) {
  const rows: [string, string][] = [
    ["App email today", `${budget.app_sent_today} of ${budget.app_cap}`],
    ["Invite emails today", `${budget.invite_sent_today} sent, ${budget.invite_waiting_today} waiting, limit ${budget.invite_limit}`],
    ["Provider daily limit", `${budget.provider_limit}, minus about ${budget.auth_emails_estimate} sign-up emails from Supabase today`],
    ["Room for invites today", String(budget.room_today)],
    ["Waiting to send, all days", String(budget.invite_waiting_total)],
  ];
  return (
    <section aria-labelledby="budget-h" className="rounded-[12px] border border-hairline bg-card p-4">
      <h2 id="budget-h" className="text-xl font-semibold">
        Email budget
      </h2>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-base sm:grid-cols-[auto_1fr]">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="font-semibold">{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="mt-2 text-base text-muted-foreground">
        Invites over today&apos;s room are queued, not dropped: they go out from 00:05 UK time on the next days, in order. An invite lasts {budget.expiry_days} days from the moment it is sent. Sign-up and reset emails come from the same provider account.
      </p>
    </section>
  );
}

export function PendingPanel({ requests, budget }: { requests: PendingRequest[]; budget: Budget }) {
  const [state, action, pending] = useActionState(decideRequests, {} as InviteActionState);
  const getKey = useBatchKey(state);
  const [count, setCount] = React.useState(0);
  const formRef = React.useRef<HTMLFormElement>(null);

  const recount = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    setCount(data.getAll("id").length + parseEmailList(String(data.get("pasted") ?? "")).emails.length);
  };
  const toggleAll = () => {
    const boxes = Array.from(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="id"]') ?? []);
    const all = boxes.every((b) => b.checked);
    boxes.forEach((b) => (b.checked = !all));
    recount();
  };
  const split = splitBySendDay(count, budget.room_today);

  return (
    <form ref={formRef} noValidate onSubmit={(e) => submitWith(e, action, getKey)} onChange={recount} className="flex flex-col gap-6" aria-label="Pending requests">
      <Result state={state} expiryDays={budget.expiry_days} />
      <section aria-labelledby="pending-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pending-h" className="text-xl font-semibold">
            Requests waiting ({requests.length})
          </h2>
          {requests.length ? (
            <Button type="button" variant="outline" onClick={toggleAll}>
              Select all or none
            </Button>
          ) : null}
        </div>
        {requests.length === 0 ? (
          <p className="text-base">No one is waiting. People can ask on the public Join page.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-start gap-3 rounded-[12px] border border-hairline bg-card p-3">
                <input id={`req-${r.id}`} type="checkbox" name="id" value={r.id} className="mt-1.5 size-6 shrink-0 accent-primary" />
                <label htmlFor={`req-${r.id}`} className="min-h-11 flex-1 text-base leading-snug [overflow-wrap:anywhere]">
                  <span className="font-semibold">{r.email}</span>
                  <span className="block text-muted-foreground">
                    {r.source === "admin" ? "Added by an admin" : "Asked on the Join page"} · {formatUkShort(r.created_at)}
                  </span>
                  {r.note ? <span className="block">{r.note}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
      <TextAreaField
        name="pasted"
        label="Or paste email addresses (not from the form)"
        hint="One per line, or separated by commas. Each becomes a request and is approved at the same time."
        rows={4}
      />
      <p className="text-base" aria-live="polite">
        {count === 0
          ? "Nothing chosen yet."
          : `${count} chosen. If you approve and email: ${split.today} go out now${split.later ? `, ${split.later} wait for the next days` : ""}.`}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button type="submit" name="intent" value="approve_email" disabled={pending} size="full" className="sm:w-auto">
          {pending ? "Working…" : "Approve and email"}
        </Button>
        <Button type="submit" name="intent" value="approve_links" disabled={pending} variant="outline" size="full" className="sm:w-auto">
          Approve without emailing
        </Button>
        <Button type="submit" name="intent" value="reject" disabled={pending} variant="outline" size="full" className="sm:w-auto">
          Reject selected
        </Button>
      </div>
      <p className="text-base text-muted-foreground">Up to 50 at a time. Rejecting sends nothing. Approving without emailing shows each link once, here.</p>
    </form>
  );
}

export function IssuedActions({ inviteId, canRevoke, canReissue, expiryDays }: { inviteId: string; canRevoke: boolean; canReissue: boolean; expiryDays?: number }) {
  const [revokeState, revoke, revoking] = useActionState(revokeInviteAction, {} as InviteActionState);
  const [reissueState, reissue, reissuing] = useActionState(reissueInviteAction, {} as InviteActionState);
  const getKey = useBatchKey(reissueState);
  return (
    <div className="mt-2 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canRevoke ? (
          <form noValidate onSubmit={(e) => submitWith(e, revoke)}>
            <input type="hidden" name="invite_id" value={inviteId} />
            <SubmitButton pending={revoking} pendingLabel="Revoking…">
              Revoke
            </SubmitButton>
          </form>
        ) : null}
        {canReissue ? (
          <form noValidate onSubmit={(e) => submitWith(e, reissue, getKey)} className="flex flex-wrap gap-2">
            <input type="hidden" name="invite_id" value={inviteId} />
            <Button type="submit" name="intent" value="approve_email" disabled={reissuing} variant="outline">
              Re-issue and email
            </Button>
            <Button type="submit" name="intent" value="approve_links" disabled={reissuing} variant="outline">
              Re-issue, show link
            </Button>
          </form>
        ) : null}
      </div>
      <Result state={revokeState} />
      <Result state={reissueState} expiryDays={expiryDays} />
    </div>
  );
}
