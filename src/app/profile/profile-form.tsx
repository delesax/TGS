"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/form";
import { updateProfile } from "./actions";

export function ProfileForm(props: { displayName: string; expertiseTag: string; bio: string }) {
  const [state, action, pending] = useActionState(updateProfile, {} as FormState);
  const errors = state.fieldErrors ?? {};

  return (
    <ActionForm action={action} aria-label="Edit your profile">
      <FormMessage state={state} />
      <TextField
        name="displayName"
        label="Your name (optional)"
        hint="For example: Jane Smith. Shown under your handle."
        defaultValue={props.displayName}
        autoComplete="name"
        maxLength={60}
        error={errors.displayName}
      />
      <TextField
        name="expertiseTag"
        label="Area of expertise (optional)"
        hint="A few words, for example: Energy policy, or Retired GP."
        defaultValue={props.expertiseTag}
        maxLength={40}
        error={errors.expertiseTag}
      />
      <TextAreaField
        name="bio"
        label="Short bio (optional)"
        hint="Up to 280 characters."
        defaultValue={props.bio}
        maxLength={280}
        error={errors.bio}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save profile
      </SubmitButton>
    </ActionForm>
  );
}
