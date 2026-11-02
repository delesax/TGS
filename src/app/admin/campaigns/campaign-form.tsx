"use client";

import { useActionState, useState } from "react";
import { ActionForm, CheckboxField, FormMessage, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/form";
import { Label } from "@/components/ui/label";
import { CATEGORIES, CATEGORY_LABELS, FORMATS, FORMAT_LABELS, MAX_ROUND_ROWS, slugify } from "@/lib/campaigns";
import { saveCampaign } from "./actions";

export type CampaignFormValues = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  rules: string;
  category: string;
  format: string;
  status: string;
  startsAt: string;
  endsAt: string;
  isSensitive: boolean;
  contentNote: string;
  opinionNotAdvice: boolean;
  notes: string;
  rounds: { title: string; startsAt: string; endsAt: string }[];
};

const selectClass =
  "min-h-12 w-full rounded-md border-2 border-input bg-background px-3 text-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring aria-[invalid=true]:border-destructive";

function SelectField({ name, label, error, options, defaultValue, hint }: { name: string; label: string; error?: string; hint?: string; options: [string, string][]; defaultValue: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      {hint ? <p id={`${name}-hint`} className="text-base text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${name}-error`} className="text-base font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      <select id={name} name={name} defaultValue={defaultValue} className={selectClass} aria-invalid={error ? true : undefined} aria-describedby={[hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(" ") || undefined}>
        <option value="">Choose…</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CampaignForm({ values }: { values: CampaignFormValues }) {
  const [state, action, pending] = useActionState(saveCampaign, {} as FormState);
  const errors = state.fieldErrors ?? {};
  const [slug, setSlug] = useState(values.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(values.id));
  const rows = Array.from({ length: MAX_ROUND_ROWS }, (_, i) => values.rounds[i] ?? { title: "", startsAt: "", endsAt: "" });

  return (
    <ActionForm action={action} aria-label={values.id ? "Edit Campaign" : "Create Campaign"}>
      <FormMessage state={state} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <TextField
        name="title"
        label="Title (the question)"
        hint="For example: Should the UK ban under-16s from social media?"
        defaultValue={values.title}
        maxLength={160}
        error={errors.title}
        onChange={(e) => {
          if (!slugTouched) setSlug(slugify(e.target.value));
        }}
      />
      <TextField
        name="slug"
        label="Web address"
        hint="The end of the page address: lower-case letters, numbers and hyphens."
        value={slug}
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.target.value);
        }}
        maxLength={80}
        error={errors.slug}
      />
      <TextAreaField name="summary" label="Summary" hint="Two or three sentences setting out the question." defaultValue={values.summary} maxLength={2000} rows={4} error={errors.summary} />
      <TextAreaField name="rules" label="Rules (optional)" hint="Published before the Campaign opens." defaultValue={values.rules} maxLength={10000} rows={4} error={errors.rules} />
      <SelectField name="category" label="Category" defaultValue={values.category} error={errors.category} options={CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]])} />
      <SelectField name="format" label="Format" defaultValue={values.format} error={errors.format} options={FORMATS.map((f) => [f, FORMAT_LABELS[f]])} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-xl font-semibold">When it runs (UK time)</legend>
        <TextField name="startsAt" type="datetime-local" label="Opens" defaultValue={values.startsAt} error={errors.startsAt} />
        <TextField name="endsAt" type="datetime-local" label="Closes" defaultValue={values.endsAt} error={errors.endsAt} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-xl font-semibold">Rounds (optional)</legend>
        <p className="text-base text-muted-foreground">Each round has its own deadline and must sit within the Campaign. Leave unused rows blank.</p>
        {rows.map((r, i) => {
          const n = i + 1;
          const error = errors[`round${n}`];
          return (
            <div key={n} className={`flex flex-col gap-3 rounded-lg border-2 p-4 ${error ? "border-destructive" : "border-border"}`}>
              <p className="text-lg font-semibold">Round {n}</p>
              {error ? (
                <p role="alert" className="text-base font-semibold text-destructive">
                  {error}
                </p>
              ) : null}
              <TextField name={`round${n}-title`} label={`Round ${n} name`} defaultValue={r.title} maxLength={80} />
              <TextField name={`round${n}-startsAt`} type="datetime-local" label={`Round ${n} starts`} defaultValue={r.startsAt} />
              <TextField name={`round${n}-endsAt`} type="datetime-local" label={`Round ${n} deadline`} defaultValue={r.endsAt} />
            </div>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-xl font-semibold">Labels</legend>
        <CheckboxField name="isSensitive" label="Sensitive topic (shows a content note before anything else)" defaultChecked={values.isSensitive} />
        <TextAreaField name="contentNote" label="Content note" hint="Needed when the topic is sensitive. Up to 500 characters." defaultValue={values.contentNote} maxLength={500} rows={3} error={errors.contentNote} />
        <CheckboxField name="opinionNotAdvice" label="Show the “opinion, not advice” label (financial and medical topics)" defaultChecked={values.opinionNotAdvice} />
      </fieldset>

      <TextAreaField name="notes" label="Admin notes (optional, not shown to Strategists)" defaultValue={values.notes} maxLength={2000} rows={3} error={errors.notes} />

      <SelectField
        name="status"
        label="Publish"
        hint="A draft is visible only to admins. A scheduled Campaign opens and closes by itself at the times above."
        defaultValue={values.status}
        error={errors.status}
        options={[
          ["draft", "Keep as draft"],
          ["scheduled", "Schedule it"],
        ]}
      />

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save Campaign
      </SubmitButton>
    </ActionForm>
  );
}
