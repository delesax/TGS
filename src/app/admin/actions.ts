"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation";

// Admin console actions. Each one checks the role here and again in the
// database (the functions read the JWT role claim), so none can be used by
// anyone else even if called directly. Every change is audit-logged.

async function adminOnly(): Promise<FormState | null> {
  const viewer = await getViewer();
  return viewer?.isAdmin ? null : { formError: "Only admins can do this." };
}

const reasonField = z.string().trim().min(1, "Give a reason. It is kept in the audit log.").max(500, "Keep the reason to 500 characters or fewer.");

function dbProblem(error: { message?: string }, fallback: string): FormState {
  const code = /^([A-Z_]+):/.exec(error.message ?? "")?.[1];
  const known: Record<string, string> = {
    NOT_HELD: "This Dispatch is no longer held.",
    WITHDRAWN: "The author withdrew this Dispatch, so it cannot be released.",
    HANDLE_TAKEN: "Someone else now has this handle.",
    HANDLE_ALREADY_CHOSEN: "This Strategist has since chosen another handle.",
    WEIGHTS_SUM: "The four weights must add up to 100.",
    WEIGHTS_INVALID: "Each weight must be a whole number from 0 to 100.",
    NOT_FOUND: "That item has already been dealt with.",
  };
  return { formError: (code && known[code]) || fallback, formHint: "Refresh the page to see the latest state." };
}

// ---------------------------------------------------------------------------
// Moderation queue
// ---------------------------------------------------------------------------

export async function moderateDispatch(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z
    .object({ dispatchId: z.uuid(), action: z.enum(["release", "keep_held", "remove", "dismiss"], "Choose what to do."), reason: reasonField })
    .safeParse({ dispatchId: formData.get("dispatchId"), action: formData.get("action") ?? undefined, reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_dispatch", { p_dispatch_id: parsed.data.dispatchId, p_action: parsed.data.action, p_reason: parsed.data.reason });
  if (error) return dbProblem(error, "We could not save that decision.");
  // No revalidation: the decided item keeps its confirmation on screen until
  // the queue is reloaded (the page is rendered fresh on every visit).
  const words = { release: "Released. It is visible to everyone.", keep_held: "Kept held.", remove: "Removed. The original is sealed, not deleted.", dismiss: "Dismissed." };
  return { success: `${words[parsed.data.action]} The decision is in the audit log and the author has been told.` };
}

export async function resolveFlag(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.object({ flagId: z.uuid(), reason: reasonField }).safeParse({ flagId: formData.get("flagId"), reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_flag", { p_flag_id: parsed.data.flagId, p_reason: parsed.data.reason });
  if (error) return dbProblem(error, "We could not close that flag.");
  return { success: "Closed. The decision is in the audit log." };
}

export async function decideHandle(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z
    .object({ flagId: z.uuid(), action: z.enum(["release", "keep_held"], "Choose what to do."), reason: reasonField })
    .safeParse({ flagId: formData.get("flagId"), action: formData.get("action") ?? undefined, reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_held_handle", { p_flag_id: parsed.data.flagId, p_action: parsed.data.action, p_reason: parsed.data.reason });
  if (error) return dbProblem(error, "We could not save that decision.");
  return { success: parsed.data.action === "release" ? "Released. The handle is now theirs." : "Kept held. They will be asked to choose another." };
}

// ---------------------------------------------------------------------------
// Strategists
// ---------------------------------------------------------------------------

export async function setPostingMute(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z
    .object({ userId: z.uuid(), muted: z.enum(["true", "false"]), reason: reasonField })
    .safeParse({ userId: formData.get("userId"), muted: formData.get("muted"), reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const muted = parsed.data.muted === "true";
  const { error } = await supabase.rpc("set_posting_mute", { p_user_id: parsed.data.userId, p_muted: muted, p_reason: parsed.data.reason });
  if (error) return dbProblem(error, "We could not change posting for this Strategist.");
  revalidatePath("/admin/users");
  return { success: muted ? "Posting muted. They see the reason on Campaign pages." : "Posting allowed again." };
}

// ---------------------------------------------------------------------------
// Settings (community_settings; every change is audited by a trigger)
// ---------------------------------------------------------------------------

const int = (min: number, max: number, label: string) =>
  z.coerce.number({ error: `Enter ${label} as a number.` }).int(`Enter ${label} as a whole number.`).min(min, `${label} must be at least ${min}.`).max(max, `${label} must be at most ${max}.`);
const ratio = (label: string) => z.coerce.number({ error: `Enter ${label} as a number.` }).min(0.05, `${label} must be at least 0.05.`).max(1, `${label} must be at most 1.`);
const model = z
  .string()
  .trim()
  .regex(/^$|^[a-z0-9][a-z0-9.@_-]{2,79}$/, "Use a model ID such as claude-haiku-5-5, or leave blank for the default.")
  .transform((v) => v || null);

const settingsSchema = z.object({
  argument_max_chars: int(100, 5000, "the argument limit"),
  rebuttal_max_chars: int(100, 5000, "the rebuttal limit"),
  evidence_max_chars: int(100, 5000, "the evidence limit"),
  max_dispatches_per_round: int(1, 100, "the per-round limit"),
  cooldown_seconds: int(0, 3600, "the cooldown"),
  edit_window_seconds: int(0, 86400, "the edit window"),
  email_daily_cap: int(1, 50, "the email cap"),
  reply_digest_minutes: int(0, 1440, "the digest wait"),
  ai_enabled: z.boolean(),
  ai_fallback_normal: z.enum(["post_unscreened", "hold"]),
  ai_fallback_sensitive: z.enum(["post_unscreened", "hold"]),
  ai_daily_cap_global: int(0, 100000, "the global AI cap"),
  ai_daily_cap_per_strategist: int(0, 1000, "the per-Strategist AI cap"),
  coach_uses_per_draft: int(0, 10, "coach uses per draft"),
  coach_daily_cap: int(0, 100, "the coach daily cap"),
  nudge_on_submit: z.boolean(),
  ai_input_max_chars: int(500, 20000, "the AI input limit"),
  ai_model_screening: model,
  ai_model_nudge: model,
  ai_model_coach: model,
  hold_threshold: ratio("the hold threshold"),
  sensitive_hold_threshold: ratio("the sensitive hold threshold"),
  undeclared_ai_flag: z.boolean(),
  screen_display_names: z.boolean(),
  screen_bios: z.boolean(),
  account_deletion_enabled: z.boolean(),
});

export type SettingsValues = z.input<typeof settingsSchema>;

const BOOLEAN_SETTINGS = ["ai_enabled", "nudge_on_submit", "undeclared_ai_flag", "screen_display_names", "screen_bios", "account_deletion_enabled"] as const;

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(settingsSchema.shape)) raw[key] = formData.get(key) ?? "";
  for (const key of BOOLEAN_SETTINGS) raw[key] = formData.get(key) === "on";
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { formError: "Please check the highlighted answers.", formHint: "Nothing has been saved yet.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("community_settings").update(parsed.data).eq("id", true);
  if (error) {
    console.error("saveSettings failed", error.code);
    return { formError: "We could not save the settings.", formHint: "Please try again. What you typed is still here." };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { success: "Saved. The change is in the audit log." };
}

/** The kill switches (migration 20261113000100). The database checks the admin role again and writes the audit entry. */
export async function setSiteSwitches(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z.object({ reason: reasonField }).safeParse({ reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { formError: "Please check the highlighted answers.", formHint: "Nothing has been changed.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_site_switches", {
    p_posting: formData.get("posting_paused") === "on",
    p_signups: formData.get("signups_paused") === "on",
    p_emails: formData.get("emails_paused") === "on",
    p_reason: parsed.data.reason,
  });
  if (error) return dbProblem(error, "We could not change the switches.");
  revalidatePath("/", "layout");
  return { success: "Saved. The change is in the audit log, and the banner updates straight away." };
}

/** App email controls (migration 20261113000600): essentials only, and the global daily cap. The database checks the role and writes the audit entry. */
export async function setEmailControls(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z
    .object({ cap: z.coerce.number().int("Use a whole number.").min(0, "Use 0 or more.").max(2000, "Use 2,000 or fewer."), reason: reasonField })
    .safeParse({ cap: formData.get("email_global_daily_cap"), reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { formError: "Please check the highlighted answers.", formHint: "Nothing has been changed.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_email_controls", {
    p_essentials_only: formData.get("email_essentials_only") === "on",
    p_global_daily_cap: parsed.data.cap,
    p_reason: parsed.data.reason,
  });
  if (error) return dbProblem(error, "We could not change the email controls.");
  revalidatePath("/admin/settings");
  return { success: "Saved. The change is in the audit log." };
}

const reactionSchema = z.object({
  key: z.string().regex(/^[a-z_]{2,30}$/),
  label: z.string().trim().min(1, "Give the reaction a label.").max(30, "Keep the label to 30 characters or fewer."),
  description: z.string().trim().min(1, "Describe the reaction in a few words.").max(160, "Keep the description to 160 characters or fewer."),
  sort: z.coerce.number().int().min(0).max(100),
  active: z.boolean(),
});

export async function saveReactionType(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = reactionSchema.safeParse({
    key: formData.get("key"),
    label: formData.get("label") ?? "",
    description: formData.get("description") ?? "",
    sort: formData.get("sort") ?? 0,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { key, ...values } = parsed.data;
  const { error } = await supabase.from("reaction_types").update(values).eq("key", key);
  // Audited by the reaction_types trigger.
  if (error) return { formError: "We could not save that reaction.", formHint: "Please try again." };
  revalidatePath("/admin/settings");
  return { success: "Saved. The change is in the audit log." };
}

// ---------------------------------------------------------------------------
// Judging weights (rule 7): a new version each time, locked once a Campaign opens
// ---------------------------------------------------------------------------

export async function saveJudgingWeights(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const w = (label: string) => z.coerce.number({ error: `Enter the ${label} weight.` }).int(`The ${label} weight must be a whole number.`).min(0, `The ${label} weight cannot be negative.`).max(100, `The ${label} weight cannot be over 100.`);
  const parsed = z
    .object({ panel: w("panel"), peer: w("peer"), ai_rubric: w("AI rubric"), mind_change: w("mind-change"), note: z.string().trim().max(500, "Keep the note to 500 characters or fewer.") })
    .refine((v) => v.panel + v.peer + v.ai_rubric + v.mind_change === 100, { message: "The four weights must add up to 100.", path: ["total"] })
    .safeParse({ panel: formData.get("panel"), peer: formData.get("peer"), ai_rubric: formData.get("ai_rubric"), mind_change: formData.get("mind_change"), note: String(formData.get("note") ?? "") });
  if (!parsed.success) return { formError: "Please check the highlighted answers.", formHint: "Nothing has been saved yet.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_judging_weights", { p_panel: v.panel, p_peer: v.peer, p_ai_rubric: v.ai_rubric, p_mind_change: v.mind_change, p_note: v.note || null });
  if (error) return dbProblem(error, "We could not save the weights.");
  revalidatePath("/admin/judging");
  return { success: `Saved as version ${data}. It applies to Campaigns that have not opened yet.` };
}
