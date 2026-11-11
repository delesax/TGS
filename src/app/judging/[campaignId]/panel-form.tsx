"use client";

import * as React from "react";
import { useActionState } from "react";
import { ActionForm, CheckboxField, FormMessage, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { savePanelScores } from "../actions";

export type PanelDispatch = { id: string; author: string; kind: string; body: string; createdAt: string; parentExcerpt: string | null };
export type PanelScore = { logic: number; evidence: number; originality: number; responsiveness: number; comment: string | null };

const CRITERIA = [
  { key: "logic", label: "Logic", hint: "Is the reasoning sound and the claim clear?" },
  { key: "evidence", label: "Evidence", hint: "Is it supported with facts, examples or sources?" },
  { key: "originality", label: "Originality", hint: "Does it add something new to the debate?" },
  { key: "responsiveness", label: "Responsiveness", hint: "Does it engage fairly with the other side?" },
] as const;

/** 1 to 5 as large radio buttons in a fieldset: keyboard and screen-reader friendly. */
function ScoreRadios({ dispatchId, criterion, label, hint, value, locked }: { dispatchId: string; criterion: string; label: string; hint: string; value?: number; locked: boolean }) {
  const name = `${dispatchId}.${criterion}`;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${name}-hint`}>
      <legend className="text-lg font-semibold">{label}</legend>
      <p id={`${name}-hint`} className="text-base text-muted-foreground">
        {hint}
      </p>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-border px-3 text-lg has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring">
            <input type="radio" name={name} value={n} defaultChecked={value === n} disabled={locked} className="sr-only" />
            {n}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PanelForm({ campaignId, dispatches, scores, locked }: { campaignId: string; dispatches: PanelDispatch[]; scores: Record<string, PanelScore>; locked: boolean }) {
  const [state, run, pending] = useActionState(savePanelScores, {} as FormState);
  const done = locked || (state.success?.startsWith("Submitted") ?? false);
  const errors = state.fieldErrors ?? {};
  // ActionForm builds FormData without the clicked button, so the intent goes in a hidden field.
  return (
    <ActionForm action={run} aria-label="Panel scores">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="intent" defaultValue="draft" />
      <FormMessage state={state} />
      <p className="text-lg">1 is weak, 3 is a decent Dispatch, 5 is excellent. Judge the quality of the argument, not whether you agree with it.</p>
      <ol className="flex flex-col gap-6">
        {dispatches.map((d, i) => (
          <li key={d.id} className="flex flex-col gap-4 rounded-xl border border-border p-4">
            <input type="hidden" name="dispatch" value={d.id} />
            <h2 className="text-xl font-bold">
              Dispatch {i + 1} of {dispatches.length}: {d.kind} by {d.author}
            </h2>
            {d.parentExcerpt ? <p className="border-l-4 border-border pl-3 text-base text-muted-foreground">Replying to: {d.parentExcerpt}</p> : null}
            <p className="whitespace-pre-line text-lg [overflow-wrap:anywhere]">{d.body}</p>
            {errors[d.id] ? (
              <p role="alert" className="text-base font-semibold text-destructive">
                {errors[d.id]}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {CRITERIA.map((c) => (
                <ScoreRadios key={c.key} dispatchId={d.id} criterion={c.key} label={c.label} hint={c.hint} value={scores[d.id]?.[c.key]} locked={done} />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={`${d.id}.comment`} className="text-lg font-semibold">
                Comment (optional, seen by admins only)
              </label>
              <Textarea id={`${d.id}.comment`} name={`${d.id}.comment`} rows={2} maxLength={1000} defaultValue={scores[d.id]?.comment ?? ""} disabled={done} />
            </div>
          </li>
        ))}
      </ol>
      {done ? (
        <p className="text-lg font-semibold">Your scores are submitted and locked.</p>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-border p-4">
          <Button type="submit" variant="outline" disabled={pending} onClick={(e) => ((e.currentTarget.form!.elements.namedItem("intent") as HTMLInputElement).value = "draft")}>
            {pending ? "Saving…" : "Save draft"}
          </Button>
          <CheckboxField name="confirm" label="I have scored every Dispatch and I am ready to submit. I understand my scores are then locked." error={errors.confirm} />
          <Button type="submit" disabled={pending} onClick={(e) => ((e.currentTarget.form!.elements.namedItem("intent") as HTMLInputElement).value = "submit")}>
            {pending ? "Submitting…" : "Submit and lock my scores"}
          </Button>
        </div>
      )}
    </ActionForm>
  );
}
