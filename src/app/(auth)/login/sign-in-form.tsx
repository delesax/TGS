"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextField, type FormState } from "@/components/form";
import { signIn } from "../actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, {} as FormState);
  const errors = state.fieldErrors ?? {};

  return (
    <ActionForm action={action} aria-label="Sign in with email">
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField name="email" label="Email address" type="email" autoComplete="username" error={errors.email} required />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" error={errors.password} required />
      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </ActionForm>
  );
}
