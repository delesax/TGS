"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextAreaField, type FormState } from "@/components/form";
import { Label } from "@/components/ui/label";
import { STATUSES, STATUS_LABELS } from "@/lib/privacy-requests";
import { updatePrivacyRequest } from "./actions";

export function UpdateForm({ id, status, note }: { id: string; status: string; note: string }) {
  const [state, action, pending] = useActionState(updatePrivacyRequest, {} as FormState);
  return (
    <ActionForm action={action} aria-label="Update this request">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <select id="status" name="status" defaultValue={status} className="min-h-12 w-full rounded-md border-2 border-input bg-background px-3 text-lg">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <TextAreaField name="note" label="Outcome note" hint="What you decided and why. Kept with the request. Not written to the audit log." rows={6} defaultValue={note} error={state.fieldErrors?.note} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save
      </SubmitButton>
    </ActionForm>
  );
}
