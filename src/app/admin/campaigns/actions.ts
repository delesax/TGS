"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { DISPATCH_KINDS, MAX_ROUND_ROWS } from "@/lib/campaigns";
import { campaignInputSchema } from "@/lib/campaign-schema";
import { createClient } from "@/lib/supabase/server";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Reads the admin form. Blank round rows are ignored. */
function readForm(formData: FormData) {
  const rounds = [];
  for (let n = 1; n <= MAX_ROUND_ROWS; n++) {
    const row = {
      title: text(formData, `round${n}-title`),
      startsAt: text(formData, `round${n}-startsAt`),
      endsAt: text(formData, `round${n}-endsAt`),
      allowedKinds: DISPATCH_KINDS.filter((k) => formData.get(`round${n}-kind-${k}`) === "on"),
    };
    if (row.title.trim() || row.startsAt || row.endsAt) rounds.push({ n, ...row });
  }
  return {
    rows: rounds,
    input: {
      title: text(formData, "title"),
      slug: text(formData, "slug"),
      summary: text(formData, "summary"),
      rules: text(formData, "rules"),
      category: text(formData, "category") || undefined,
      format: text(formData, "format") || undefined,
      status: text(formData, "status") || undefined,
      startsAt: text(formData, "startsAt"),
      endsAt: text(formData, "endsAt"),
      isSensitive: formData.get("isSensitive") === "on",
      contentNote: text(formData, "contentNote"),
      opinionNotAdvice: formData.get("opinionNotAdvice") === "on",
      notes: text(formData, "notes"),
      rounds: rounds.map(({ title, startsAt, endsAt, allowedKinds }) => ({ title, startsAt, endsAt, allowedKinds })),
    },
  };
}

export async function saveCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { formError: "Only admins can save Campaigns.", formHint: "Sign in with an admin account and try again." };

  const id = text(formData, "id") || null;
  const { input, rows } = readForm(formData);
  const parsed = campaignInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [first, index] = issue.path;
      // Round errors go next to the row the admin typed them in (blank rows are skipped).
      const key = first === "rounds" && typeof index === "number" ? `round${rows[index].n}` : String(first).replace(/^round(\d+)$/, (_, i) => `round${rows[Number(i) - 1]?.n ?? i}`);
      fieldErrors[key] ??= issue.message;
    }
    return { formError: "Please check the highlighted answers.", formHint: "Nothing has been saved yet. What you typed is still here.", fieldErrors };
  }

  const v = parsed.data;
  const supabase = await createClient();
  const { data: savedId, error } = await supabase.rpc("save_campaign", {
    p_id: id,
    p_campaign: {
      slug: v.slug,
      title: v.title,
      summary: v.summary,
      rules: v.rules || null,
      category: v.category,
      format: v.format,
      status: v.status,
      starts_at: v.startsAt,
      ends_at: v.endsAt,
      is_sensitive: v.isSensitive,
      content_note: v.contentNote || null,
      opinion_not_advice: v.opinionNotAdvice,
      notes: v.notes || null,
    },
    p_rounds: v.rounds.map((r) => ({ title: r.title, starts_at: r.startsAt, ends_at: r.endsAt, allowed_kinds: r.allowedKinds })),
  });

  if (error) {
    console.error("saveCampaign failed", error.code);
    if (error.code === "23505") return { formError: "That web address is already used by another Campaign.", fieldErrors: { slug: "Choose a different web address." } };
    if (error.message.includes("campaigns_no_schedule_while_undecided"))
      return {
        formError: "This Campaign needs an owner decision before it can be scheduled.",
        formHint: "Keep it as a draft for now. The decision needed is shown at the top of this page.",
        fieldErrors: { status: "Keep this as a draft until the owner decision is made." },
      };
    return { formError: "We could not save the Campaign.", formHint: "Please try again in a moment. What you typed is still here." };
  }

  revalidatePath("/campaigns");
  revalidatePath("/admin/campaigns");
  redirect(`/admin/campaigns/${savedId as string}?saved=1`);
}
