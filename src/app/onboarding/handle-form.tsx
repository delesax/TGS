"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextField, type FormState } from "@/components/form";
import { chooseHandle } from "./actions";

export function HandleForm() {
  const [state, action, pending] = useActionState(chooseHandle, {} as FormState);

  return (
    <ActionForm action={action} aria-label="Choose your handle">
      <FormMessage state={state} />
      <TextField
        name="handle"
        label="Handle"
        hint="3 to 20 characters. Start with a letter, then use letters, numbers or underscores (_). For example: Jane_Smith or Strategist42."
        error={state.fieldErrors?.handle}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={20}
        required
      />
      <p className="text-base text-muted-foreground">
        We check every handle against our community rules. Names that could pass for staff or official accounts, or that are
        hateful, are not allowed.
      </p>
      <SubmitButton pending={pending} pendingLabel="Checking your handle…">
        Save my handle
      </SubmitButton>
    </ActionForm>
  );
}
