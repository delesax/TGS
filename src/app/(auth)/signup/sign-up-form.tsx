"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ActionForm, CheckboxField, FormMessage, SubmitButton, TextField, type FormState } from "@/components/form";
import { signUp } from "../actions";

export function SignUpForm({ initialCode }: { initialCode: string }) {
  const [state, action, pending] = useActionState(signUp, {} as FormState);
  const errors = state.fieldErrors ?? {};

  return (
    <ActionForm action={action} aria-label="Create your account">
      <FormMessage state={state} />
      <TextField
        name="inviteCode"
        label="Invite code"
        hint="You will find it in your invitation email, for example TGS-ABCD-EFGH-JKMN."
        error={errors.inviteCode}
        defaultValue={initialCode}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        required
      />
      <TextField name="email" label="Email address" type="email" autoComplete="email" error={errors.email} required />
      <TextField
        name="password"
        label="Choose a password"
        hint="At least 10 characters. A short phrase of three or four words is easy to remember."
        type="password"
        autoComplete="new-password"
        error={errors.password}
        required
      />
      <CheckboxField name="ageConfirmed" label="I am 18 or over." error={errors.ageConfirmed} required />
      <CheckboxField
        name="publicAcknowledged"
        label="I understand that my Dispatches are public, and that if I delete my account they stay in the debate record without my name."
        error={errors.publicAcknowledged}
        required
      />
      <CheckboxField
        name="termsAccepted"
        error={errors.termsAccepted}
        required
        label={
          <>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-semibold text-primary underline">
              terms of use
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" target="_blank" className="font-semibold text-primary underline">
              privacy policy
            </Link>
            . (Links open in a new tab.)
          </>
        }
      />
      <SubmitButton pending={pending} pendingLabel="Creating your account…">
        Create account
      </SubmitButton>
    </ActionForm>
  );
}
