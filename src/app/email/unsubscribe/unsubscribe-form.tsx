"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ActionForm, FormMessage, SubmitButton, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { confirmUnsubscribe } from "./actions";

export function UnsubscribeForm({ token, kind, label }: { token: string; kind: string; label: string }) {
  const [state, action, pending] = useActionState(confirmUnsubscribe, {} as FormState);
  return (
    <ActionForm action={action} aria-label="Unsubscribe">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="kind" value={kind} />
      {state.success ? (
        <Button asChild variant="outline" className="self-start">
          <Link href="/profile/email">Change other email settings</Link>
        </Button>
      ) : (
        <SubmitButton pending={pending} pendingLabel="Unsubscribing…">
          {label}
        </SubmitButton>
      )}
    </ActionForm>
  );
}
