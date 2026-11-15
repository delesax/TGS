"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/form";
import { NOTE_MAX } from "@/lib/join-requests";
import { requestToJoin } from "./actions";

export function JoinForm() {
  const [state, action, pending] = useActionState(requestToJoin, {} as FormState);
  const errors = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} aria-label="Ask to join" className="relative">
      <FormMessage state={state} />
      <TextField name="email" label="Your email address" type="email" autoComplete="email" error={errors.email} required />
      <TextAreaField
        name="note"
        label="Anything you would like us to know (optional)"
        hint={`For example how you heard about us. Up to ${NOTE_MAX} characters.`}
        rows={3}
        maxLength={NOTE_MAX}
        error={errors.note}
      />
      {/* Bots fill every field. People never see this one. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Ask to join
      </SubmitButton>
    </ActionForm>
  );
}
