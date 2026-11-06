// Who the signed-in person is, from their sign-in and their profile row. Pure,
// so it is unit tested. Kept apart from auth.ts, which needs the request.

export type Profile = {
  id: string;
  handle: string | null;
  display_name: string | null;
  expertise_tag: string | null;
  bio: string | null;
  created_at: string;
  /** Set when the account was deleted (a tombstone). Never set on a live account. */
  deleted_at?: string | null;
};

export type Viewer = {
  userId: string;
  email: string;
  /** From the JWT app_metadata claim, which only the server can set. Never a client flag. */
  isAdmin: boolean;
  profile: Profile | null;
};

export type SignIn = { id: string; email?: string | null; app_metadata?: Record<string, unknown> | null };

/**
 * A user whose profile is a tombstone (deleted_at is set) is treated as signed
 * out, even if their sign-in still works, so a deleted account can never post,
 * choose a handle or reach any signed-in page.
 */
export function resolveViewer(user: SignIn | null, profile: Profile | null): Viewer | null {
  if (!user) return null;
  if (profile?.deleted_at) return null;
  return { userId: user.id, email: user.email ?? "", isAdmin: user.app_metadata?.role === "admin", profile };
}
