"use server";

import type { FormState } from "@/components/form";
import { joinFormEnabled } from "@/lib/join-form";
import { joinRequestSchema } from "@/lib/join-requests";
import { hashSubject, ipSubject, withinLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors } from "@/lib/validation";

// The same answer for everyone: a new request, a repeat, a current member and a bot all read this, so the form cannot be
// used to find out who has an account or who has already asked. No email is sent.
const SAME: FormState = {
  success: "Thank you. We have your request. If we can offer you a place, we will email you. We do not send a confirmation now.",
};

/** "Ask to join". Saves a pending request; admins decide. Never says whether the address is known. */
export async function requestToJoin(_prev: FormState, formData: FormData): Promise<FormState> {
  // Switched off (the default): refuse before anything else runs, so nothing is rate-limited, read or written. A server
  // action can be called without the page, so the page being hidden is not enough.
  if (!joinFormEnabled()) return { formError: "Requests to join are not open yet." };

  // A hidden field only a bot fills in. Say thank you and do nothing.
  if (String(formData.get("website") ?? "").trim() !== "") return SAME;

  const parsed = joinRequestSchema.safeParse({ email: String(formData.get("email") ?? ""), note: String(formData.get("note") ?? "") });
  if (!parsed.success) {
    return { formError: "Please check the highlighted answers.", formHint: "Nothing has been sent yet. What you typed is still here.", fieldErrors: fieldErrors(parsed.error) };
  }

  if (!(await withinLimit("join_request_ip", await ipSubject()))) {
    return { formError: "Too many requests from here just now.", formHint: "Please try again in an hour." };
  }
  // These two limits answer like a success: they protect the admin list, and say nothing about the address.
  if (!(await withinLimit("join_request_email", hashSubject(parsed.data.email))) || !(await withinLimit("join_request_all", "all"))) return SAME;

  const { error } = await createAdminClient().rpc("request_to_join", { p_email: parsed.data.email, p_note: parsed.data.note || null });
  if (error) {
    console.error("request_to_join failed", error.code);
    return { formError: "We could not save your request.", formHint: "Please try again in a few minutes. What you typed is still here." };
  }
  return SAME;
}
