"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, type FormState } from "@/components/form";
import { POSITION_LABELS, POSITIONS, type PositionChoice } from "@/lib/campaigns";
import { recordPosition } from "./actions";

export function PositionForm({
  campaignId,
  slug,
  stage,
  current,
}: {
  campaignId: string;
  slug: string;
  stage: "before" | "after";
  current: PositionChoice | null;
}) {
  const [state, action, pending] = useActionState(recordPosition, {} as FormState);
  const error = state.fieldErrors?.position;
  const legend = stage === "before" ? "Where do you stand before the debate?" : "Where do you stand now?";

  return (
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
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {current ? "Change my position" : "Record my position"}
      </SubmitButton>
    </ActionForm>
  );
}
