import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  handle: string | null;
  display_name: string | null;
  expertise_tag: string | null;
  bio: string | null;
  created_at: string;
};

export type Viewer = {
  userId: string;
  email: string;
  /** From the JWT app_metadata claim, which only the server can set. Never a client flag. */
  isAdmin: boolean;
  profile: Profile | null;
};

/** The signed-in Strategist for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name, expertise_tag, bio, created_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return { userId: user.id, email: user.email ?? "", isAdmin: user.app_metadata?.role === "admin", profile: profile ?? null };
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
