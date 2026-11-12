"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextField, type FormState } from "@/components/form";
import { resetPassword } from "../actions";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, {} as FormState);
  const errors = state.fieldErrors ?? {};

  return (
    <ActionForm action={action} aria-label="Choose a new password">
      <FormMessage state={state} />
      <TextField
        name="password"
        label="New password"
        hint="At least 10 characters. A short phrase of three or four words is easy to remember."
        type="password"
        autoComplete="new-password"
        error={errors.password}
        required
      />
      <TextField name="confirmPassword" label="Type the new password again" type="password" autoComplete="new-password" error={errors.confirmPassword} required />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save new password
      </SubmitButton>
    </ActionForm>
  );
}
