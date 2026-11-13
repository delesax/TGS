"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus, WifiOff, X } from "lucide-react";
import { postDispatch, editDispatch, type DispatchFormState } from "@/app/campaigns/[slug]/dispatch-actions";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DispatchKind } from "@/lib/campaigns";
import type { AiHelp as AiHelpSettings } from "@/lib/dispatch-data";
import dynamic from "next/dynamic";
import { AI_USES, AI_USE_LABELS, KIND_LABELS, MAX_SOURCES, maxCharsFor, type AiUse, type DispatchLimits, type Source } from "@/lib/dispatches";

export type ComposeTarget = { id: string; handle: string | null };

/** A random v4 UUID. randomUUID needs HTTPS; getRandomValues works on plain-HTTP test addresses too. */
function newDraftKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// The tone check and coach load separately, after the form itself.
const AiHelp = dynamic(() => import("./ai-help").then((m) => m.AiHelp), { ssr: false });

/** A private nudge about tone. Only the author sees it. */
function NudgeNote({ nudge }: { nudge: string }) {
  return (
    <p role="note" className="rounded-lg border-2 border-accent-foreground bg-accent p-3 text-lg text-accent-foreground">
      <strong>A private note:</strong> {nudge} <span className="text-base">Only you can see this.</span>
    </p>
  );
}

type Props = {
  campaignId: string;
  slug: string;
  limits: DispatchLimits;
  /** Kinds offered in the top-level box (the current round's allowed kinds, minus rebuttal). */
  kinds: DispatchKind[];
  /** Replying to this Dispatch: the kind is fixed to rebuttal. */
  replyTo?: ComposeTarget;
  /** Editing an existing Dispatch. */
  editing?: { id: string; kind: DispatchKind; body: string; aiUse: AiUse; sources: Source[]; parentId: string | null };
  /** Seconds of cooldown left when the page loaded. */
  initialWait?: number;
  opinionNotAdvice?: boolean;
  /** Oxford-style Campaign: ask which side this Dispatch argues (shown publicly). */
  askSide?: boolean;
  /** Tone check and coach, when the AI is switched on. */
  aiHelp?: AiHelpSettings;
  onDone?: () => void;
  onCancel?: () => void;
};

/** Online/offline from the browser. Posting needs a connection; the draft is kept either way. */
function useOnline(): boolean {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

const noSubscribe = () => () => {};

function readDraft(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return ""; // Storage can be unavailable (private mode); the draft just is not kept.
  }
}

/** Keeps an unsent draft in this tab, so a refresh or a dropped connection does not lose it. */
function useDraft(key: string, initial: string) {
  const stored = React.useSyncExternalStore(noSubscribe, () => readDraft(key), () => "");
  const [edited, setEdited] = React.useState<string | null>(null);
  const update = React.useCallback(
    (next: string) => {
      setEdited(next);
      try {
        if (next) window.sessionStorage.setItem(key, next);
        else window.sessionStorage.removeItem(key);
      } catch {}
    },
    [key],
  );
  return [edited ?? (initial || stored), update] as const;
}

export function ComposeForm({ campaignId, slug, limits, kinds, replyTo, editing, initialWait = 0, opinionNotAdvice, askSide, aiHelp, onDone, onCancel }: Props) {
  const [state, action, pending] = useActionState(editing ? editDispatch : postDispatch, {} as DispatchFormState);
  const online = useOnline();
  const idBase = editing ? `edit-${editing.id}` : replyTo ? `reply-${replyTo.id}` : "compose";
  const fixedKind: DispatchKind | null = editing ? editing.kind : replyTo ? "rebuttal" : kinds.length === 1 ? kinds[0] : null;
  const [kind, setKind] = React.useState<DispatchKind | null>(fixedKind);
  const [body, setBody] = useDraft(`tgs-draft:${campaignId}:${idBase}`, editing?.body ?? "");
  const [sourceRows, setSourceRows] = React.useState(Math.max(1, editing?.sources.length ?? 1));
  // Counts coach uses per draft. Random, made here; the draft text is never stored.
  const [draftKey, setDraftKey] = React.useState(newDraftKey);

  // Cooldown: count down from the server's answer.
  const [wait, setWait] = React.useState(initialWait);
  const [answered, setAnswered] = React.useState(state);
  if (answered !== state) {
    setAnswered(state);
    if (state.waitSeconds) setWait(state.waitSeconds);
  }
  React.useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  // Clear the box after a successful post.
  const handled = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    if (state.postedAt && handled.current !== state.postedAt) {
      handled.current = state.postedAt;
      if (!editing) setBody("");
      setDraftKey(newDraftKey());
      // Keep the box open long enough to read a private nudge.
      if (!state.nudge) onDone?.();
    }
  }, [state, editing, setBody, onDone]);

  const max = kind ? maxCharsFor(kind, limits) : maxCharsFor("argument", limits);
  const length = body.trim().length;
  const over = length > max;
  const errors = state.fieldErrors ?? {};
  const showSources = kind === "evidence" || kind === "rebuttal";
  const label = editing ? "Edit your Dispatch" : replyTo ? `Reply to @${replyTo.handle ?? "a Strategist"}` : "Write a Dispatch";

  return (
    <ActionForm action={action} aria-label={label} className="gap-5">
      <FormMessage state={state} />
      {state.nudge ? <NudgeNote nudge={`${state.nudge} You can still edit your Dispatch for a few minutes.`} /> : null}
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="slug" value={slug} />
      {editing ? <input type="hidden" name="dispatchId" value={editing.id} /> : null}
      {replyTo || editing?.parentId ? <input type="hidden" name="parentId" value={replyTo?.id ?? editing?.parentId ?? ""} /> : null}
      {fixedKind ? <input type="hidden" name="kind" value={fixedKind} /> : null}

      {opinionNotAdvice ? (
        <p role="note" className="rounded-lg border-2 border-border bg-muted p-3 text-base">
          <strong>Opinion, not advice.</strong> Your Dispatch is a personal view. Do not present it as financial, medical or professional advice.
        </p>
      ) : null}

      {!fixedKind ? (
        <fieldset className="flex flex-col gap-2" aria-describedby={errors.kind ? `${idBase}-kind-error` : undefined}>
          <legend className="mb-1 text-lg font-semibold">What are you posting?</legend>
          {errors.kind ? (
            <p id={`${idBase}-kind-error`} className="text-base font-semibold text-destructive">
              {errors.kind}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {kinds.map((k) => (
              <label
                key={k}
                className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border-2 border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-muted has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring"
              >
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-1 size-6 shrink-0 accent-primary" />
                <span>
                  <span className="block text-lg font-semibold">{KIND_LABELS[k].label}</span>
                  <span className="block text-base text-muted-foreground">{KIND_LABELS[k].explain}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {askSide && !editing ? (
        <fieldset className="flex flex-col gap-2" aria-describedby={errors.side ? `${idBase}-side-error` : undefined}>
          <legend className="mb-1 text-lg font-semibold">Which side does your Dispatch argue?</legend>
          <p className="text-base text-muted-foreground">Shown publicly on your Dispatch. This is not your private position.</p>
          {errors.side ? (
            <p id={`${idBase}-side-error`} className="text-base font-semibold text-destructive">
              {errors.side}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {(["for", "against"] as const).map((side) => (
              <label
                key={side}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 border-border px-4 text-lg font-semibold has-[:checked]:border-primary has-[:checked]:bg-muted has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring"
              >
                <input type="radio" name="side" value={side} className="size-6 shrink-0 accent-primary" />
                {side === "for" ? "For" : "Against"}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idBase}-body`}>{replyTo ? "Your rebuttal" : kind === "evidence" ? "Why this evidence matters" : "Your Dispatch"}</Label>
        {errors.body ? (
          <p id={`${idBase}-body-error`} className="text-base font-semibold text-destructive">
            {errors.body}
          </p>
        ) : null}
        <Textarea
          id={`${idBase}-body`}
          name="body"
          rows={replyTo ? 4 : 6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={errors.body || over ? true : undefined}
          aria-describedby={`${idBase}-count${errors.body ? ` ${idBase}-body-error` : ""}`}
        />
        <p id={`${idBase}-count`} className={over ? "text-base font-semibold text-destructive" : "text-base text-muted-foreground"}>
          {length.toLocaleString("en-GB")} of {max.toLocaleString("en-GB")} characters{over ? `. Please cut ${(length - max).toLocaleString("en-GB")}.` : ""}
        </p>
      </div>

      {showSources ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-lg font-semibold">{kind === "evidence" ? "Source links (at least one)" : "Source links (optional)"}</legend>
          <p className="text-base text-muted-foreground">Web links starting with http:// or https://. Tracking codes are removed. Up to {MAX_SOURCES}.</p>
          {errors.sources ? <p className="text-base font-semibold text-destructive">{errors.sources}</p> : null}
          {Array.from({ length: sourceRows }, (_, i) => {
            const n = i + 1;
            const initial = editing?.sources[i];
            const err = errors[`source${n}`];
            return (
              <div key={n} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <Label htmlFor={`${idBase}-source${n}Url`}>Link {n}</Label>
                {err ? (
                  <p id={`${idBase}-source${n}-error`} className="text-base font-semibold text-destructive">
                    {err}
                  </p>
                ) : null}
                <Input
                  id={`${idBase}-source${n}Url`}
                  name={`source${n}Url`}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://"
                  defaultValue={initial?.url}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? `${idBase}-source${n}-error` : undefined}
                />
                <Label htmlFor={`${idBase}-source${n}Title`} className="text-base">
                  Title of the page (optional)
                </Label>
                <Input id={`${idBase}-source${n}Title`} name={`source${n}Title`} maxLength={200} defaultValue={initial?.title} />
              </div>
            );
          })}
          {sourceRows < MAX_SOURCES ? (
            <Button type="button" variant="outline" className="self-start" onClick={() => setSourceRows((n) => n + 1)}>
              <Plus aria-hidden /> Add another link
            </Button>
          ) : null}
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2" aria-describedby={errors.aiUse ? `${idBase}-ai-error` : undefined}>
        <legend className="mb-1 text-lg font-semibold">Did you use AI to write this?</legend>
        <p className="text-base text-muted-foreground">Your answer is shown on your Dispatch. You must choose one.</p>
        {errors.aiUse ? (
          <p id={`${idBase}-ai-error`} className="text-base font-semibold text-destructive">
            {errors.aiUse}
          </p>
        ) : null}
        {AI_USES.map((use) => (
          <label
            key={use}
            className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border-2 border-border p-3 text-lg has-[:checked]:border-primary has-[:checked]:bg-muted has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring"
          >
            <input type="radio" name="aiUse" value={use} defaultChecked={editing?.aiUse === use} className="mt-1 size-6 shrink-0 accent-primary" />
            {AI_USE_LABELS[use].choice}
          </label>
        ))}
      </fieldset>

      {aiHelp?.enabled && !editing ? (
        <AiHelp campaignId={campaignId} kind={kind ?? "argument"} body={body} draftKey={draftKey} usesPerDraft={aiHelp.coachUsesPerDraft} key={draftKey} />
      ) : null}

      {!online ? (
        <p role="status" className="flex items-start gap-2 rounded-lg border-2 border-accent-foreground bg-accent p-3 text-lg text-accent-foreground">
          <WifiOff aria-hidden className="mt-1 size-5 shrink-0" />
          <span>
            <strong>You are offline.</strong> Your text is kept on this device. Post it when your connection comes back.
          </span>
        </p>
      ) : wait > 0 ? (
        <p role="status" className="rounded-lg border-2 border-border bg-muted p-3 text-lg">
          You can post again in {wait} second{wait === 1 ? "" : "s"}. Your text is kept.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {!online || wait > 0 ? (
          <Button type="button" size="full" disabled aria-disabled>
            {!online ? "Waiting for a connection" : `Wait ${wait}s`}
          </Button>
        ) : (
          <SubmitButton pending={pending} pendingLabel={editing ? "Saving…" : "Posting…"}>
            {editing ? "Save changes" : replyTo ? "Post rebuttal" : "Post Dispatch"}
          </SubmitButton>
        )}
        {onCancel ? (
          <Button type="button" variant="ghost" size="full" className="sm:w-auto" onClick={onCancel}>
            <X aria-hidden /> Cancel
          </Button>
        ) : null}
      </div>
    </ActionForm>
  );
}
