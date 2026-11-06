"use client";

import * as React from "react";
import { useActionState } from "react";
import { ActionForm, CheckboxField, FormMessage, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/form";
import { Label } from "@/components/ui/label";
import { useDecisionLog } from "./decision-log";
import { decideHandle, moderateDispatch, resolveFlag, saveJudgingWeights, saveReactionType, saveSettings, setPostingMute, type SettingsValues } from "./actions";

type Choice = { value: string; label: string; hint?: string };

/**
 * A decision with a required reason: radio choices, a reason box, one button.
 * Inside the moderation queue a successful decision goes to the "Just decided"
 * log, the list refreshes, and this form starts afresh (so an item that stays in
 * the queue can be decided again). Elsewhere the confirmation stays in place.
 */
function DecisionForm(props: {
  id: string;
  label: string;
  /** What was decided on, for the confirmation: for example "@Ada: “text…”". */
  summary?: string;
  hidden: Record<string, string>;
  choices: Choice[];
  action: (state: FormState, data: FormData) => Promise<FormState>;
  warning?: string;
  submitLabel?: string;
}) {
  const log = useDecisionLog();
  const [round, setRound] = React.useState(0);
  return (
    <DecisionFormBody
      key={round}
      {...props}
      inQueue={Boolean(log)}
      onDone={(message) => {
        log?.add(props.summary ?? props.label, message);
        setRound((r) => r + 1);
      }}
    />
  );
}

function DecisionFormBody({
  id,
  label,
  hidden,
  choices,
  action,
  warning,
  submitLabel = "Save decision",
  inQueue,
  onDone,
}: {
  id: string;
  label: string;
  summary?: string;
  hidden: Record<string, string>;
  choices: Choice[];
  action: (state: FormState, data: FormData) => Promise<FormState>;
  warning?: string;
  submitLabel?: string;
  inQueue: boolean;
  onDone: (message: string) => void;
}) {
  const [state, run, pending] = useActionState(action, {} as FormState);
  const errors = state.fieldErrors ?? {};
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (inQueue && state.success && !reported.current) {
      reported.current = true;
      onDone(state.success);
    }
  }, [inQueue, state.success, onDone]);
  if (state.success) {
    return inQueue ? (
      <p role="status" className="text-base text-muted-foreground">
        Saved. See “Just decided” above.
      </p>
    ) : (
      <p role="status" className="rounded-lg border-2 border-success bg-success/10 p-3 text-lg font-semibold">
        {state.success} <span className="font-normal">Reload the page to update the list.</span>
      </p>
    );
  }
  return (
    <ActionForm action={run} aria-label={label} className="gap-4">
      <FormMessage state={state} />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {warning ? (
        <p role="note" className="rounded-lg border-2 border-destructive p-3 text-base font-semibold text-destructive">
          {warning}
        </p>
      ) : null}
      {choices.length > 1 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-lg font-semibold">Decision</legend>
          {errors.action ? <p className="text-base font-semibold text-destructive">{errors.action}</p> : null}
          {choices.map((c) => (
            <label key={c.value} className="flex min-h-12 cursor-pointer items-start gap-3 py-1 text-lg">
              <input type="radio" name="action" value={c.value} className="mt-1 size-6 shrink-0 accent-primary" />
              <span>
                {c.label}
                {c.hint ? <span className="block text-base text-muted-foreground">{c.hint}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <input type="hidden" name="action" value={choices[0]?.value ?? ""} />
      )}
      <TextAreaField name="reason" label="Reason (required, kept in the audit log)" error={errors.reason} rows={2} maxLength={500} id={`reason-${id}`} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {submitLabel}
      </SubmitButton>
    </ActionForm>
  );
}

export function DispatchDecision({ dispatchId, summary, status, hasReports, sameAdminWarning }: { dispatchId: string; summary: string; status: string; hasReports: boolean; sameAdminWarning?: boolean }) {
  const choices: Choice[] = [];
  if (status !== "visible") choices.push({ value: "release", label: "Release", hint: "Make it visible to everyone." });
  if (status === "held") choices.push({ value: "keep_held", label: "Keep held", hint: "Only the author can see it." });
  if (status !== "removed") choices.push({ value: "remove", label: "Remove", hint: 'Others see "Removed by a moderator." The original is sealed, not deleted.' });
  if (status === "visible" || hasReports) choices.push({ value: "dismiss", label: status === "visible" ? "Dismiss (no action)" : "Dismiss reports only", hint: "Close the reports and flags; change nothing." });
  return (
    <DecisionForm
      id={dispatchId}
      label="Decide on this Dispatch"
      summary={summary}
      hidden={{ dispatchId }}
      choices={choices}
      action={moderateDispatch}
      warning={
        sameAdminWarning
          ? "You made the original decision on this Dispatch. Ideally a different person decides the appeal. With one admin in the pilot you can go ahead; this will be noted in the audit log."
          : undefined
      }
    />
  );
}

export function FlagDecision({ flagId, summary }: { flagId: string; summary?: string }) {
  return <DecisionForm id={flagId} label="Close this flag" summary={summary} hidden={{ flagId }} choices={[{ value: "dismiss", label: "Close" }]} action={resolveFlag} submitLabel="Close flag, no change" />;
}

export function HandleDecision({ flagId, summary }: { flagId: string; summary?: string }) {
  return (
    <DecisionForm
      id={flagId}
      label="Decide on this handle"
      summary={summary}
      hidden={{ flagId }}
      choices={[
        { value: "release", label: "Release", hint: "The handle becomes theirs, if it is still free." },
        { value: "keep_held", label: "Keep held", hint: "They must choose another handle." },
      ]}
      action={decideHandle}
    />
  );
}

export function MuteForm({ userId, muted, handle }: { userId: string; muted: boolean; handle: string }) {
  return (
    <DecisionForm
      id={userId}
      label={muted ? `Allow @${handle} to post again` : `Mute posting for @${handle}`}
      hidden={{ userId, muted: muted ? "false" : "true" }}
      choices={[{ value: "set", label: muted ? "Unmute" : "Mute" }]}
      action={setPostingMute}
      submitLabel={muted ? "Allow posting again" : "Mute posting"}
    />
  );
}

function SelectSetting({ name, label, value, options, hint, error }: { name: string; label: string; value: string; options: [string, string][]; hint?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      {hint ? <p className="text-base text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-base font-semibold text-destructive">{error}</p> : null}
      <select id={name} name={name} defaultValue={value} className="min-h-12 w-full rounded-md border-2 border-input bg-background px-3 text-lg">
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SettingsForm({ values, defaults }: { values: SettingsValues; defaults: { screening: string; nudge: string; coach: string } }) {
  const [state, run, pending] = useActionState(saveSettings, {} as FormState);
  const e = state.fieldErrors ?? {};
  const n = (name: keyof SettingsValues, label: string, hint?: string) => (
    <TextField name={name} label={label} hint={hint} type="number" inputMode="numeric" defaultValue={String(values[name] ?? "")} error={e[name]} />
  );
  const fallback: [string, string][] = [
    ["post_unscreened", "Post it, marked unscreened, for a person to look at"],
    ["hold", "Hold it until a person looks"],
  ];
  return (
    <ActionForm action={run} aria-label="Community settings">
      <FormMessage state={state} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-2xl font-bold">AI</legend>
        <div className="rounded-lg border-2 border-destructive p-3">
          <CheckboxField name="ai_enabled" label="AI features on (untick to switch off screening, nudges and the coach at once)" defaultChecked={Boolean(values.ai_enabled)} />
        </div>
        <SelectSetting name="ai_fallback_normal" label="When the AI is off, down or over its cap: a Dispatch in a normal Campaign" value={String(values.ai_fallback_normal)} options={fallback} error={e.ai_fallback_normal} />
        <SelectSetting name="ai_fallback_sensitive" label="…and in a sensitive Campaign" value={String(values.ai_fallback_sensitive)} options={fallback} error={e.ai_fallback_sensitive} />
        {n("ai_daily_cap_global", "Daily AI calls, everyone together", "Screening, nudges and coaching. Over the cap, the fallback above applies.")}
        {n("ai_daily_cap_per_strategist", "Daily nudges and coaching per Strategist", "Screening is never capped per person.")}
        {n("coach_uses_per_draft", "Coach uses per draft")}
        {n("coach_daily_cap", "Coach uses per Strategist per day")}
        {n("ai_input_max_chars", "Longest text sent to the AI (characters)", "Longer text is not sent; the fallback applies.")}
        <TextField name="hold_threshold" label="Hold when the AI is at least this sure (0.05 to 1)" defaultValue={String(values.hold_threshold)} error={e.hold_threshold} inputMode="decimal" />
        <TextField name="sensitive_hold_threshold" label="…on sensitive Campaigns (stricter, so lower)" defaultValue={String(values.sensitive_hold_threshold)} error={e.sensitive_hold_threshold} inputMode="decimal" />
        <TextField name="ai_model_screening" label="Model for screening" hint={`Blank uses ${defaults.screening}.`} defaultValue={String(values.ai_model_screening ?? "")} error={e.ai_model_screening} />
        <TextField name="ai_model_nudge" label="Model for nudges" hint={`Blank uses ${defaults.nudge}.`} defaultValue={String(values.ai_model_nudge ?? "")} error={e.ai_model_nudge} />
        <TextField
          name="ai_model_coach"
          label="Model for the coach"
          hint={`Blank uses ${defaults.coach}. Sonnet costs about 20 times as much as Haiku per word; enter claude-haiku-5-5 to switch.`}
          defaultValue={String(values.ai_model_coach ?? "")}
          error={e.ai_model_coach}
        />
        <CheckboxField name="nudge_on_submit" label="Check tone privately when a Strategist posts (never blocks posting)" defaultChecked={Boolean(values.nudge_on_submit)} />
        <CheckboxField
          name="undeclared_ai_flag"
          label="Flag Dispatches declared “none” that read like pasted AI text, for review only. Detection is unreliable; never act on it alone."
          defaultChecked={Boolean(values.undeclared_ai_flag)}
        />
        <CheckboxField name="screen_display_names" label="Also screen display names (handles are always screened)" defaultChecked={Boolean(values.screen_display_names)} />
        <CheckboxField name="screen_bios" label="Also screen bios" defaultChecked={Boolean(values.screen_bios)} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-2xl font-bold">Dispatch limits</legend>
        {n("argument_max_chars", "Argument length (characters)")}
        {n("rebuttal_max_chars", "Rebuttal length (characters)")}
        {n("evidence_max_chars", "Evidence note length (characters)")}
        {n("max_dispatches_per_round", "Dispatches per Strategist per round")}
        {n("cooldown_seconds", "Seconds between posts")}
        {n("edit_window_seconds", "Seconds a Dispatch can be edited")}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-2xl font-bold">Email</legend>
        {n("email_daily_cap", "Emails per person per day")}
        {n("reply_digest_minutes", "Minutes to gather replies into one email")}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-2xl font-bold">Accounts</legend>
        <p role="note" className="rounded-lg border-2 border-accent-foreground bg-accent p-3 text-base text-accent-foreground">
          <strong>Owner decision:</strong> the delete-account wording is a DRAFT awaiting approval. Leave this off until it is approved.
        </p>
        <CheckboxField name="account_deletion_enabled" label="Let Strategists delete their own account" defaultChecked={Boolean(values.account_deletion_enabled)} />
      </fieldset>

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save settings
      </SubmitButton>
    </ActionForm>
  );
}

export function ReactionTypeForm({ r }: { r: { key: string; label: string; description: string; sort: number; active: boolean } }) {
  const [state, run, pending] = useActionState(saveReactionType, {} as FormState);
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm action={run} aria-label={`Reaction ${r.label}`} className="gap-3 rounded-lg border border-border p-3">
      <FormMessage state={state} />
      <input type="hidden" name="key" value={r.key} />
      <TextField name="label" id={`label-${r.key}`} label="Label" defaultValue={r.label} maxLength={30} error={e.label} />
      <TextField name="description" id={`description-${r.key}`} label="Description" defaultValue={r.description} maxLength={160} error={e.description} />
      <TextField name="sort" id={`sort-${r.key}`} label="Order" type="number" inputMode="numeric" defaultValue={String(r.sort)} error={e.sort} />
      <CheckboxField name="active" id={`active-${r.key}`} label="Offered to Strategists" defaultChecked={r.active} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save reaction
      </SubmitButton>
    </ActionForm>
  );
}

export function WeightsForm({ current }: { current: { panel: number; peer: number; ai_rubric: number; mind_change: number } }) {
  const [state, run, pending] = useActionState(saveJudgingWeights, {} as FormState);
  const [w, setW] = React.useState(current);
  const total = w.panel + w.peer + w.ai_rubric + w.mind_change;
  const e = state.fieldErrors ?? {};
  const field = (key: keyof typeof current, label: string) => (
    <TextField
      name={key}
      label={`${label} (%)`}
      type="number"
      inputMode="numeric"
      min={0}
      max={100}
      value={String(w[key])}
      onChange={(ev) => setW((old) => ({ ...old, [key]: Number(ev.target.value) || 0 }))}
      error={e[key]}
    />
  );
  return (
    <ActionForm action={run} aria-label="Judging weights">
      <FormMessage state={state} />
      {field("panel", "Panel score")}
      {field("peer", "Peer votes")}
      {field("ai_rubric", "AI rubric")}
      {field("mind_change", "Mind-change movement")}
      <p role="status" className={total === 100 ? "text-lg font-semibold" : "text-lg font-semibold text-destructive"}>
        Total: {total}%{total === 100 ? "" : ". The weights must add up to 100."}
      </p>
      {e.total ? <p className="text-base font-semibold text-destructive">{e.total}</p> : null}
      <TextAreaField name="note" label="Why are you changing them? (optional)" rows={2} maxLength={500} error={e.note} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save as a new version
      </SubmitButton>
    </ActionForm>
  );
}
