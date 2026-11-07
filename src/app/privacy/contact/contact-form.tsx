"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/form";
import { REQUEST_TYPES, REQUEST_TYPE_LABELS, MAX_MESSAGE } from "@/lib/privacy-requests";
import { Label } from "@/components/ui/label";
import { submitPrivacyRequest } from "./actions";

export function ContactForm({ signedInEmail }: { signedInEmail: string | null }) {
  const [state, action, pending] = useActionState(submitPrivacyRequest, {} as FormState);
  const errors = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} aria-label="Contact us about your data">
      <FormMessage state={state} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="type">What is your message about?</Label>
        {errors.type ? (
          <p id="type-error" className="text-base font-semibold text-destructive">
            {errors.type}
          </p>
        ) : null}
        <select
          id="type"
          name="type"
          defaultValue=""
          aria-invalid={errors.type ? true : undefined}
          aria-describedby={errors.type ? "type-error" : undefined}
          className="min-h-12 w-full rounded-md border-2 border-input bg-background px-3 text-lg"
        >
          <option value="" disabled>
            Choose one
          </option>
          {REQUEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {REQUEST_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {signedInEmail ? (
        <TextField
          name="email"
          label="Your email address"
          hint="This is the address on your account. We reply here."
          type="email"
          value={signedInEmail}
          readOnly
          error={errors.email}
        />
      ) : (
        <TextField name="email" label="Your email address" hint="We reply to this address." type="email" autoComplete="email" error={errors.email} required />
      )}
      <TextAreaField name="message" label="Your message" hint={`Up to ${MAX_MESSAGE.toLocaleString("en-GB")} characters.`} rows={8} error={errors.message} required />
      {/* Bots fill every field. People never see this one. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Send message
      </SubmitButton>
    </ActionForm>
  );
}
