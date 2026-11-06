import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveViewer, type Profile, type Viewer } from "@/lib/viewer";

export type { Profile, Viewer };

/** The signed-in Strategist for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name, expertise_tag, bio, created_at, deleted_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  // A deleted account (tombstone) counts as signed out.
  return resolveViewer(user, profile ?? null);
});

/**
 * Use at the top of signed-in pages. Sends signed-out visitors to sign in, and
 * Strategists without a handle to choose one first.
 */
export async function requireStrategist(path: string): Promise<Viewer & { profile: Profile & { handle: string } }> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!viewer.profile?.handle) redirect("/onboarding");
  return viewer as Viewer & { profile: Profile & { handle: string } };
}

/** Use at the top of admin pages. Non-admins get a plain "not found". RLS enforces the same rule in the database. */
export async function requireAdmin(path: string): Promise<Viewer & { profile: Profile & { handle: string } }> {
  const viewer = await requireStrategist(path);
  if (!viewer.isAdmin) notFound();
  return viewer;
}
