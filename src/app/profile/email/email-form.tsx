"use client";

import { useActionState } from "react";
import { ActionForm, CheckboxField, FormMessage, SubmitButton, type FormState } from "@/components/form";
import { saveEmailPreferences } from "./actions";

export type EmailPrefs = { replies: boolean; campaign_updates: boolean; closing_soon: boolean; unsubscribed_all_at: string | null };

export function EmailForm({ prefs }: { prefs: EmailPrefs }) {
  const [state, action, pending] = useActionState(saveEmailPreferences, {} as FormState);
  const off = Boolean(prefs.unsubscribed_all_at);
  return (
    <ActionForm action={action} aria-label="Email settings">
      <FormMessage state={state} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xl font-semibold">Send me an email when…</legend>
        <CheckboxField name="replies" label="someone replies to one of my Dispatches (several replies are gathered into one email)" defaultChecked={!off && prefs.replies} />
        <CheckboxField name="campaign_updates" label="a Campaign I follow opens, moves to its next round, or closes" defaultChecked={!off && prefs.campaign_updates} />
        <CheckboxField name="closing_soon" label="a Campaign I am in will close within 24 hours" defaultChecked={!off && prefs.closing_soon} />
      </fieldset>
      <div className="rounded-lg border-2 border-dashed border-border p-3">
        <CheckboxField name="stopAll" label="Stop all emails from The Grand Strategist" defaultChecked={off} />
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save email settings
      </SubmitButton>
    </ActionForm>
  );
}
