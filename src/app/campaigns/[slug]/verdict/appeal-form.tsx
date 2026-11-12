"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextAreaField, type FormState } from "@/components/form";
import { appealVerdict } from "./actions";

export function AppealForm({ verdictId, slug }: { verdictId: string; slug: string }) {
  const [state, run, pending] = useActionState(appealVerdict, {} as FormState);
  if (state.success) return <FormMessage state={state} />;
  return (
    <ActionForm action={run} aria-label="Appeal this Verdict">
      <FormMessage state={state} />
      <input type="hidden" name="verdictId" value={verdictId} />
      <input type="hidden" name="slug" value={slug} />
      <TextAreaField name="reason" label="Why do you think the Verdict is wrong?" hint="Up to 1,000 characters. Be specific: which part of the judging, and why." rows={5} maxLength={1000} error={state.fieldErrors?.reason} />
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Send my appeal
      </SubmitButton>
    </ActionForm>
  );
}
