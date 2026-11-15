"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { generateStrongInviteCode, inviteCodeHash, inviteLink } from "@/lib/invite-codes";
import { ISSUE_STATUS_WORDS, MAX_BATCH, parseEmailList, type IssueResult } from "@/lib/join-requests";
import { createClient } from "@/lib/supabase/server";

/** What the screen shows after an action. Links appear here once and are never stored. */
export type InviteActionState = FormState & { links?: { email: string; link: string }[]; lines?: string[] };

const NOT_ADMIN: InviteActionState = { formError: "Only admins can do this." };

function problem(code: string | undefined, message: string): InviteActionState {
  if (/BATCH_SIZE/.test(message)) return { formError: `Choose between 1 and ${MAX_BATCH} people at a time.` };
  if (/INVITE_EMAIL_OFF/.test(message)) return { formError: "Invite emails are switched off in the email settings.", formHint: "Add “invite” to the essential email kinds, or approve without emailing." };
  if (/ALREADY_USED/.test(message)) return { formError: "That invite has already been used, so it cannot be changed." };
  if (/ALREADY_MEMBER/.test(message)) return { formError: "That address already has an account." };
  if (/NOT_FOUND/.test(message)) return { formError: "We could not find that invite or request.", formHint: "Refresh the page and try again." };
  if (/NOT_ADMIN/.test(message)) return NOT_ADMIN;
  console.error("invite action failed", code);
  return { formError: "We could not do that.", formHint: "Nothing was changed that you were not told about. Refresh the page and try again." };
}

function summarise(results: IssueResult[]): string[] {
  const lines: string[] = [];
  for (const r of results) {
    if (r.status === "issued") continue;
    lines.push(`${r.email || "(unknown)"}: ${ISSUE_STATUS_WORDS[r.status] ?? r.status}`);
  }
  return lines;
}

/**
 * Approve selected requests and pasted addresses (with or without the email), or reject selected requests.
 * The browser sends a per-page key, so a double click or a retry cannot make two invites. Codes are made here and only
 * their hash goes to the database.
 */
export async function decideRequests(_prev: InviteActionState, formData: FormData): Promise<InviteActionState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NOT_ADMIN;
  const intent = z.enum(["approve_email", "approve_links", "reject"]).safeParse(formData.get("intent"));
  const key = z.uuid().safeParse(formData.get("key"));
  if (!intent.success) return { formError: "Choose what to do with the people you selected." };
  if (!key.success) return { formError: "This page is not ready yet.", formHint: "Wait a second and try again, or refresh the page." };

  const ids = z.array(z.uuid()).safeParse(formData.getAll("id").map(String));
  if (!ids.success) return { formError: "Something went wrong with the selection.", formHint: "Refresh the page and try again." };
  const pasted = parseEmailList(String(formData.get("pasted") ?? ""));
  const supabase = await createClient();

  if (intent.data === "reject") {
    if (ids.data.length < 1) return { formError: "Tick at least one request to reject." };
    if (ids.data.length > MAX_BATCH) return { formError: `Choose ${MAX_BATCH} or fewer at a time.` };
    const { data, error } = await supabase.rpc("reject_join_requests", { p_ids: ids.data });
    if (error) return problem(error.code, error.message);
    revalidatePath("/admin/invites");
    return { success: `${data as number} request${data === 1 ? "" : "s"} rejected. They were not emailed.` };
  }

  const total = ids.data.length + pasted.emails.length;
  if (total < 1) return { formError: "Tick at least one request, or paste at least one email address." };
  if (total > MAX_BATCH) return { formError: `You chose ${total} people. The most at one time is ${MAX_BATCH}.` };

  const sendEmail = intent.data === "approve_email";
  const codes = Array.from({ length: total }, () => generateStrongInviteCode());
  const items = [
    ...ids.data.map((id) => ({ request_id: id })),
    ...pasted.emails.map((email) => ({ email })),
  ].map((who, i) => ({ ...who, code_hash: inviteCodeHash(codes[i]), ...(sendEmail ? { code: codes[i] } : {}) }));

  const { data, error } = await supabase.rpc("issue_invites", { p_items: items, p_send_email: sendEmail, p_key: key.data });
  if (error) return problem(error.code, error.message);
  const out = data as { duplicate: boolean; results: IssueResult[] };
  revalidatePath("/admin/invites");
  if (out.duplicate) {
    return { formError: "That batch was already processed.", formHint: "Nothing new was made. Check the list below. Links from the first attempt cannot be shown again: re-issue them if you need them." };
  }

  const site = publicEnv().NEXT_PUBLIC_SITE_URL;
  const issued = out.results.filter((r) => r.status === "issued");
  const invalid = pasted.invalid.length ? [`Not an email address, so skipped: ${pasted.invalid.slice(0, 5).join(", ")}${pasted.invalid.length > 5 ? ", …" : ""}`] : [];
  const lines = [...summarise(out.results), ...invalid];
  if (sendEmail) {
    const waiting = issued.filter((r) => r.send_after && Date.parse(r.send_after) > Date.now() + 60_000).length;
    return {
      success: `${issued.length} invite${issued.length === 1 ? "" : "s"} made. ${issued.length - waiting} will be emailed now${waiting ? `, ${waiting} on the next days when the email budget allows` : ""}.`,
      lines,
    };
  }
  const links = out.results
    .map((r, i) => (r.status === "issued" ? { email: r.email, link: inviteLink(site, codes[i]) } : null))
    .filter((x): x is { email: string; link: string } => x !== null);
  return { success: `${issued.length} invite${issued.length === 1 ? "" : "s"} made without emailing. Copy the links now: they are shown once and cannot be shown again.`, links, lines };
}

export async function revokeInviteAction(_prev: InviteActionState, formData: FormData): Promise<InviteActionState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NOT_ADMIN;
  const id = z.uuid().safeParse(formData.get("invite_id"));
  if (!id.success) return { formError: "We could not find that invite." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invite", { p_invite_id: id.data });
  if (error) return problem(error.code, error.message);
  revalidatePath("/admin/invites");
  return { success: "Invite revoked. Its link no longer works." };
}

export async function reissueInviteAction(_prev: InviteActionState, formData: FormData): Promise<InviteActionState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NOT_ADMIN;
  const id = z.uuid().safeParse(formData.get("invite_id"));
  const key = z.uuid().safeParse(formData.get("key"));
  const intent = z.enum(["approve_email", "approve_links"]).safeParse(formData.get("intent"));
  if (!id.success || !key.success || !intent.success) return { formError: "This page is not ready yet.", formHint: "Wait a second and try again, or refresh the page." };
  const sendEmail = intent.data === "approve_email";
  const code = generateStrongInviteCode();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reissue_invite", {
    p_invite_id: id.data,
    p_code_hash: inviteCodeHash(code),
    p_code: sendEmail ? code : null,
    p_send_email: sendEmail,
    p_key: key.data,
  });
  if (error) return problem(error.code, error.message);
  const out = data as { duplicate: boolean; email?: string; send_after?: string | null };
  revalidatePath("/admin/invites");
  if (out.duplicate) return { formError: "That was already processed.", formHint: "Nothing new was made. Check the list." };
  if (sendEmail) {
    const waiting = out.send_after && Date.parse(out.send_after) > Date.now() + 60_000;
    return { success: waiting ? "New invite made. The old one is revoked. The email goes out on a later day when the budget allows." : "New invite made and emailed. The old one is revoked." };
  }
  return {
    success: "New invite made. The old one is revoked. Copy the link now: it is shown once.",
    links: [{ email: out.email ?? "", link: inviteLink(publicEnv().NEXT_PUBLIC_SITE_URL, code) }],
  };
}
