"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FollowResult = { ok: true } | { ok: false; message: string };

export async function setStrategistFollow(followedId: string, handle: string, follow: boolean): Promise<FollowResult> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { ok: false, message: "Please sign in to follow Strategists." };
  if (!z.uuid().safeParse(followedId).success) return { ok: false, message: "Something went wrong." };
  if (followedId === viewer.userId) return { ok: false, message: "You cannot follow yourself." };
  const supabase = await createClient();
  const { error } = follow
    ? await supabase
        .from("strategist_follows")
        .upsert({ follower_id: viewer.userId, followed_id: followedId }, { onConflict: "follower_id,followed_id", ignoreDuplicates: true })
    : await supabase.from("strategist_follows").delete().eq("follower_id", viewer.userId).eq("followed_id", followedId);
  if (error) return { ok: false, message: "We could not update your follows. Please try again." };
  if (/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(handle)) revalidatePath(`/strategists/${handle}`);
  revalidatePath("/dossier");
  return { ok: true };
}
