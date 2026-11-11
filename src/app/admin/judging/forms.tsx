"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, type FormState } from "@/components/form";

/**
 * A small admin form: hidden values, the fields given as children, one button.
 * The confirmation or error stays on screen until dismissed.
 */
export function AdminForm({
  action,
  label,
  hidden,
  submitLabel,
  pendingLabel = "Saving…",
  children,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  label: string;
  hidden?: Record<string, string>;
  submitLabel: string;
  pendingLabel?: string;
  children?: React.ReactNode;
}) {
  const [state, run, pending] = useActionState(action, {} as FormState);
  return (
    <ActionForm action={run} aria-label={label} className="flex flex-col gap-4">
      <FormMessage state={state} />
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <SubmitButton pending={pending} pendingLabel={pendingLabel}>
        {submitLabel}
      </SubmitButton>
    </ActionForm>
  );
}
