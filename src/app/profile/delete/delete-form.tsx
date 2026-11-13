"use client";

import { useActionState } from "react";
import { ActionForm, CheckboxField, FormMessage, TextField, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { deleteMyAccount } from "./actions";

export function DeleteForm({ handle }: { handle: string }) {
  const [state, action, pending] = useActionState(deleteMyAccount, {} as FormState);
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} aria-label="Delete my account">
      <FormMessage state={state} />
      <TextField name="handle" label={`Type your handle, ${handle}, to confirm`} autoComplete="off" autoCapitalize="off" spellCheck={false} error={e.handle} />
      <TextField name="password" type="password" label="Your password" autoComplete="current-password" error={e.password} />
      <CheckboxField name="understood" label="I understand that deleting my account is permanent, and that what is listed under “Stays, without your name” remains." error={e.understood} />
      <Button type="submit" variant="destructive" size="full" disabled={pending} aria-disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </ActionForm>
  );
}
