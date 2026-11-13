"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ActionForm, CheckboxField, FormMessage, SubmitButton, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { POSITION_LABELS, POSITIONS, type PositionChoice } from "@/lib/campaigns";
import { clearPosition, recordPosition } from "./actions";

export function PositionForm({
  campaignId,
  slug,
  stage,
  current,
  consented,
  hasAnyPosition,
}: {
  campaignId: string;
  slug: string;
  stage: "before" | "after";
  current: PositionChoice | null;
  /** Has agreed to positions being recorded. When false, the notice and box show. */
  consented: boolean;
  /** Any position is on record for this Campaign (so it can be cleared). */
  hasAnyPosition: boolean;
}) {
  const [state, action, pending] = useActionState(recordPosition, {} as FormState);
  const [clearState, clearAction, clearing] = useActionState(clearPosition, {} as FormState);
  const error = state.fieldErrors?.position;
  const legend = stage === "before" ? "Where do you stand before the debate?" : "Where do you stand now?";

  return (
    <>
    <ActionForm action={action} aria-label={legend}>
      <FormMessage state={state} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="stage" value={stage} />
      <fieldset className="flex flex-col gap-3" aria-describedby={error ? "position-error" : undefined}>
        <legend className="mb-2 text-xl font-semibold">{legend}</legend>
        {error ? (
          <p id="position-error" className="text-base font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          {POSITIONS.map((p) => (
            <label
              key={p}
              className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 border-border px-4 text-lg font-semibold has-[:checked]:border-primary has-[:checked]:bg-muted has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring"
            >
              <input type="radio" name="position" value={p} defaultChecked={current === p} className="size-6 accent-primary" />
              {POSITION_LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>
      {!consented ? (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-accent-foreground bg-accent p-4 text-lg text-accent-foreground">
          <p>
            Recording your position is optional. It shows your view on a public issue, which UK law treats as sensitive. We keep it private and use it
            only to measure how minds change. Anyone outside our moderation team sees only anonymous totals. You can withdraw at any time by clearing
            your position, or by deleting your account.{" "}
            <Link href="/privacy#sensitive-subjects" target="_blank" className="font-semibold underline">
              How we use your positions
            </Link>
          </p>
          <CheckboxField name="consent" label="I agree to you recording my position on Campaigns." error={state.fieldErrors?.consent} />
        </div>
      ) : null}
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {current ? "Change my position" : "Record my position"}
      </SubmitButton>
    </ActionForm>
    {hasAnyPosition ? (
      <ActionForm action={clearAction} aria-label="Clear my position" className="mt-4">
        <FormMessage state={clearState} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="slug" value={slug} />
        <Button type="submit" variant="outline" className="self-start" disabled={clearing}>
          {clearing ? "Clearing…" : "Clear my position"}
        </Button>
      </ActionForm>
    ) : null}
    </>
  );
}
