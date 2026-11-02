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
import { AI_USES, AI_USE_LABELS, KIND_LABELS, MAX_SOURCES, maxCharsFor, type AiUse, type DispatchLimits, type Source } from "@/lib/dispatches";

export type ComposeTarget = { id: string; handle: string | null };

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

export function ComposeForm({ campaignId, slug, limits, kinds, replyTo, editing, initialWait = 0, opinionNotAdvice, onDone, onCancel }: Props) {
  const [state, action, pending] = useActionState(editing ? editDispatch : postDispatch, {} as DispatchFormState);
  const online = useOnline();
  const idBase = editing ? `edit-${editing.id}` : replyTo ? `reply-${replyTo.id}` : "compose";
  const fixedKind: DispatchKind | null = editing ? editing.kind : replyTo ? "rebuttal" : kinds.length === 1 ? kinds[0] : null;
  const [kind, setKind] = React.useState<DispatchKind | null>(fixedKind);
  const [body, setBody] = useDraft(`tgs-draft:${campaignId}:${idBase}`, editing?.body ?? "");
  const [sourceRows, setSourceRows] = React.useState(Math.max(1, editing?.sources.length ?? 1));

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
      onDone?.();
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
