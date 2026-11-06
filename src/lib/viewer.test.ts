import { describe, expect, it } from "vitest";
import { resolveViewer, type Profile } from "./viewer";

const user = { id: "u1", email: "a@example.test", app_metadata: {} };
const profile: Profile = { id: "u1", handle: "Ada", display_name: null, expertise_tag: null, bio: null, created_at: "2026-11-01T00:00:00Z", deleted_at: null };

describe("resolveViewer", () => {
  it("is signed out without a sign-in", () => {
    expect(resolveViewer(null, profile)).toBeNull();
  });

  it("returns the Strategist for a live account", () => {
    expect(resolveViewer(user, profile)).toEqual({ userId: "u1", email: "a@example.test", isAdmin: false, profile });
  });

  it("treats a deleted account (tombstone) as signed out, even though the sign-in still works", () => {
    const tombstone: Profile = { ...profile, handle: null, deleted_at: "2026-11-02T10:00:00Z" };
    expect(resolveViewer(user, tombstone)).toBeNull();
    // Even if a handle were somehow present, a tombstone is still signed out.
    expect(resolveViewer(user, { ...profile, deleted_at: "2026-11-02T10:00:00Z" })).toBeNull();
  });

  it("keeps a sign-in with no profile row yet (onboarding), and reads the admin role from the claim", () => {
    expect(resolveViewer(user, null)).toMatchObject({ userId: "u1", profile: null, isAdmin: false });
    expect(resolveViewer({ ...user, app_metadata: { role: "admin" } }, profile)?.isAdmin).toBe(true);
    expect(resolveViewer({ ...user, app_metadata: { role: "editor" } }, profile)?.isAdmin).toBe(false);
  });
});
