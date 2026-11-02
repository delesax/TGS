"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, FormMessage, SubmitButton, type FormState } from "@/components/form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { dismissReports, hideDispatch, restoreDispatch, type AdminResult } from "./actions";

export function HideForm({ dispatchId }: { dispatchId: string }) {
  const [state, action, pending] = useActionState(hideDispatch, {} as FormState);
  return (
    <ActionForm action={action} aria-label="Hide this Dispatch" className="gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="dispatchId" value={dispatchId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={`reason-${dispatchId}`}>Reason for hiding (kept in the audit log)</Label>
        {state.fieldErrors?.reason ? (
          <p id={`reason-${dispatchId}-error`} className="text-base font-semibold text-destructive">
            {state.fieldErrors.reason}
          </p>
        ) : null}
        <Textarea
          id={`reason-${dispatchId}`}
          name="reason"
          rows={2}
          maxLength={500}
          aria-invalid={state.fieldErrors?.reason ? true : undefined}
          aria-describedby={state.fieldErrors?.reason ? `reason-${dispatchId}-error` : undefined}
        />
      </div>
      <SubmitButton pending={pending} pendingLabel="Hiding…">
        Hide this Dispatch
      </SubmitButton>
    </ActionForm>
  );
}

function ActionButton({ label, pendingLabel, run, variant }: { label: string; pendingLabel: string; run: () => Promise<AdminResult>; variant: "outline" | "secondary" }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await run();
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {pending ? pendingLabel : label}
      </Button>
      {error ? (
        <p role="alert" className="text-base font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DismissButton({ dispatchId }: { dispatchId: string }) {
  return <ActionButton label="Dismiss the reports" pendingLabel="Dismissing…" variant="outline" run={() => dismissReports(dispatchId)} />;
}

export function RestoreButton({ dispatchId }: { dispatchId: string }) {
  return <ActionButton label="Restore it" pendingLabel="Restoring…" variant="secondary" run={() => restoreDispatch(dispatchId)} />;
}
