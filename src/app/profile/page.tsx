import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStrategist } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PasskeyManager, type PasskeySummary } from "./passkey-manager";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your account" };

export default async function ProfilePage() {
  const viewer = await requireStrategist("/profile");
  const supabase = await createClient();
  const { data: passkeys, error: passkeyError } = await supabase
    .from("passkeys")
    .select("id, nickname, created_at, last_used_at")
    .order("created_at", { ascending: true });

  return (
    <Page title="Your account" intro={<>Signed in as <strong className="text-foreground">@{viewer.profile.handle}</strong>.</>}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft aria-hidden />
            Back to home
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/dossier">View my Dossier</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Other Strategists can see this on your Dossier. Everything here is optional.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-1 text-lg">
            <dt className="font-semibold">Handle</dt>
            <dd className="mb-2">@{viewer.profile.handle} (handles cannot be changed)</dd>
            <dt className="font-semibold">Email address</dt>
            <dd>{viewer.email} (only you can see this)</dd>
          </dl>
          <ProfileForm
            displayName={viewer.profile.display_name ?? ""}
            expertiseTag={viewer.profile.expertise_tag ?? ""}
            bio={viewer.profile.bio ?? ""}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Passkeys</CardTitle>
          <CardDescription>
            Sign in with your fingerprint, face or device PIN instead of typing your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasskeyManager passkeys={(passkeys ?? []) as PasskeySummary[]} loadFailed={Boolean(passkeyError)} />
        </CardContent>
      </Card>
    </Page>
  );
}
