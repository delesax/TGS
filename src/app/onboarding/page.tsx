import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Page } from "@/components/page";
import { getViewer } from "@/lib/auth";
import { HandleForm } from "./handle-form";

export const metadata: Metadata = { title: "Choose your handle" };

export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/onboarding");
  if (viewer.profile?.handle) redirect("/dossier");

  return (
    <Page
      narrow
      title="Choose your handle"
      intro="Your handle is the name other Strategists see next to your Dispatches. You cannot change it later, so choose carefully."
    >
      <HandleForm />
    </Page>
  );
}
