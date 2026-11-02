import type { Metadata } from "next";
import { Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_MODELS } from "@/lib/ai/config";
import { createClient } from "@/lib/supabase/server";
import { ReactionTypeForm, SettingsForm } from "../admin-forms";
import type { SettingsValues } from "../actions";
import { AdminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin("/admin/settings");
  const supabase = await createClient();
  const [{ data: settings, error }, { data: reactions }] = await Promise.all([
    supabase.from("community_settings").select("*").single(),
    supabase.from("reaction_types").select("key, label, description, sort, active").order("sort"),
  ]);
  if (error || !settings) throw new Error("Could not load settings");
  // The environment may name other default models; show what blank means here.
  const defaults = {
    screening: process.env.AI_MODEL_SCREENING || DEFAULT_MODELS.screening,
    nudge: process.env.AI_MODEL_NUDGE || DEFAULT_MODELS.nudge,
    coach: process.env.AI_MODEL_COACH || DEFAULT_MODELS.coach,
  };
  return (
    <Page title="Settings" intro="Community limits, email caps, reactions and the AI controls. Every change is recorded in the audit log with the values before and after.">
      <AdminNav current="/admin/settings" />
      <SettingsForm values={settings as SettingsValues} defaults={defaults} />
      <section aria-labelledby="reactions-h" className="flex flex-col gap-4">
        <h2 id="reactions-h" className="text-2xl font-bold">
          Reactions
        </h2>
        <p className="text-lg text-muted-foreground">Reactions are information for Strategists only. They never count towards a Verdict.</p>
        {((reactions as { key: string; label: string; description: string; sort: number; active: boolean }[]) ?? []).map((r) => (
          <ReactionTypeForm key={r.key} r={r} />
        ))}
      </section>
    </Page>
  );
}
