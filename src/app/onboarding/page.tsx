import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Page } from "@/components/page";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { HandleForm } from "./handle-form";

export const metadata: Metadata = { title: "Choose your handle" };

export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/onboarding");
  if (viewer.profile?.handle) redirect("/dossier");
  // A handle the AI did not allow waits for a person. Flags are admin-only, so
  // this reads the Strategist's own request with the service role.
  const { data: waiting } = await createAdminClient()
    .from("moderation_flags")
    .select("details")
    .eq("user_id", viewer.userId)
    .eq("kind", "held_handle")
    .eq("status", "open")
    .maybeSingle<{ details: { handle?: string } }>();

  return (
    <Page
      narrow
      title="Choose your handle"
      intro="Your handle is the name other Strategists see next to your Dispatches. You cannot change it later, so choose carefully."
    >
      {waiting?.details.handle ? (
        <p role="status" className="rounded-lg border-2 border-border bg-muted p-4 text-lg">
          <strong>A person is checking @{waiting.details.handle}.</strong> If it is approved, it becomes your handle and this page takes you to your
          Dossier. You can also choose a different handle below now.
        </p>
      ) : null}
      <HandleForm />
    </Page>
  );
}
