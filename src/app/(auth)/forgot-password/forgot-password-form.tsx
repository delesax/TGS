"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextField, type FormState } from "@/components/form";
import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {} as FormState);
  const errors = state.fieldErrors ?? {};

  return (
    <ActionForm action={action} aria-label="Ask for a password reset link">
      <FormMessage state={state} />
      <TextField name="email" label="Email address" type="email" autoComplete="email" error={errors.email} required />
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Send me a reset link
      </SubmitButton>
    </ActionForm>
  );
}
