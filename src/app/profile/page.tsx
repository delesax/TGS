import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bell, Download } from "lucide-react";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStrategist } from "@/lib/auth";
import { hasPositionsConsent } from "@/lib/positions-consent";
import { createClient } from "@/lib/supabase/server";
import { PasskeyManager, type PasskeySummary } from "./passkey-manager";
import { StopPositionsForm } from "./positions-card";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your account" };

export default async function ProfilePage() {
  const viewer = await requireStrategist("/profile");
  const supabase = await createClient();
  const consented = await hasPositionsConsent(viewer.userId);
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
          <CardDescription>Anyone can see this on your public Strategist page. Everything here is optional.</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Choose which emails we send you: replies to your Dispatches, and news about Campaigns you follow.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary">
            <Link href="/profile/email">
              <Bell aria-hidden /> Email settings
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Campaign positions</CardTitle>
          <CardDescription>
            Recording a position is optional and private. If you stop, we delete your positions on open Campaigns and keep the numbers from closed
            Campaigns with no link to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StopPositionsForm consented={consented} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            Download what we hold about you: your account and consents, profile, Dispatches and their edit history, positions, reactions, follows,
            reports, appeals, decisions about your Dispatches, coach ratings, email settings, passkey names and privacy requests. The file is in JSON, a
            standard format other programs can read.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button asChild variant="secondary" className="self-start">
            <a href="/profile/export" download>
              <Download aria-hidden /> Download my data
            </a>
          </Button>
          <Button asChild variant="outline" className="self-start">
            <Link href="/privacy/contact">Contact us about your data</Link>
          </Button>
          <div className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-border p-4">
            <h3 className="text-xl font-semibold">Deleting your account</h3>
            <p className="text-lg">See exactly what is removed and what stays, then decide.</p>
            <Button asChild variant="outline" className="self-start">
              <Link href="/profile/delete">Delete my account</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}
