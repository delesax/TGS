"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Peer votes, steelman confirmations and the mind-change pick. Every rule
// (participants only, never your own Dispatch, the window, vote credits) is
// enforced by the database functions; these actions only translate errors.

export type VoteResult = { ok: true; message: string } | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  NOT_ELIGIBLE: "That Dispatch is no longer part of the judging.",
  VOTING_CLOSED: "Peer voting is not open for this Campaign.",
  NOT_A_PARTICIPANT: "Only Strategists who took part in this Campaign can do this.",
  OWN_DISPATCH: "You cannot do this for your own Dispatch.",
  NO_CREDITS: "You have used all your votes. Remove one to vote for another Dispatch.",
  PICKS_CLOSED: "Picks are not open for this Campaign.",
};

const input = z.object({ dispatchId: z.uuid(), slug: z.string().min(1).max(80) });

async function run(rpc: string, args: Record<string, unknown>, slug: string, done: (data: unknown) => string): Promise<VoteResult> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { ok: false, error: "Sign in to take part." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) {
    const code = /^([A-Z_]+):/.exec(error.message)?.[1];
    return { ok: false, error: (code && MESSAGES[code]) || "That did not work. Please try again." };
  }
  revalidatePath(`/campaigns/${slug}/vote`);
  return { ok: true, message: done(data) };
}

const credits = (n: unknown) => `${n} vote${Number(n) === 1 ? "" : "s"} left.`;

export async function castVote(dispatchId: string, slug: string): Promise<VoteResult> {
  const p = input.safeParse({ dispatchId, slug });
  if (!p.success) return { ok: false, error: "Something went wrong." };
  return run("cast_peer_vote", { p_dispatch_id: dispatchId }, slug, (n) => `Vote saved. ${credits(n)}`);
}

export async function withdrawVote(dispatchId: string, slug: string): Promise<VoteResult> {
  const p = input.safeParse({ dispatchId, slug });
  if (!p.success) return { ok: false, error: "Something went wrong." };
  return run("withdraw_peer_vote", { p_dispatch_id: dispatchId }, slug, (n) => `Vote removed. ${credits(n)}`);
}

export async function setSteelman(dispatchId: string, slug: string, confirmed: boolean): Promise<VoteResult> {
  const p = input.safeParse({ dispatchId, slug });
  if (!p.success) return { ok: false, error: "Something went wrong." };
  return run("set_steelman_confirmation", { p_dispatch_id: dispatchId, p_confirmed: confirmed }, slug, () =>
    confirmed ? "Saved: you confirmed it fairly restates the other side." : "Confirmation removed.",
  );
}

export async function pickMindChanger(dispatchId: string, slug: string): Promise<VoteResult> {
  const p = input.safeParse({ dispatchId, slug });
  if (!p.success) return { ok: false, error: "Something went wrong." };
  return run("pick_mind_changer", { p_dispatch_id: dispatchId }, slug, () => "Saved as the Dispatch that changed your mind.");
}

export async function clearMindChangePick(campaignId: string, slug: string): Promise<VoteResult> {
  if (!z.uuid().safeParse(campaignId).success) return { ok: false, error: "Something went wrong." };
  return run("clear_mind_change_pick", { p_campaign_id: campaignId }, slug, () => "Your pick was removed.");
}
