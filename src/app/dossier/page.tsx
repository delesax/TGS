import type { Metadata } from "next";
import Link from "next/link";
import { Award, FileText, Medal } from "lucide-react";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireStrategist } from "@/lib/auth";

export const metadata: Metadata = { title: "Your Dossier" };

const memberSince = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export default async function DossierPage({ searchParams }: PageProps<"/dossier">) {
  const viewer = await requireStrategist("/dossier");
  const { welcome } = await searchParams;
  const p = viewer.profile;

  return (
    <Page title="Your Dossier" intro="Your permanent record of Dispatches, awards and titles.">
      {welcome ? (
        <p role="status" className="rounded-lg border-2 border-success bg-[#ecfdf3] p-4 text-lg text-success">
          Welcome, @{p.handle}. Your account is ready.
        </p>
      ) : null}

      <section aria-labelledby="dossier-who" className="rounded-xl border border-border p-5">
        <h2 id="dossier-who" className="text-2xl font-semibold">
          @{p.handle}
        </h2>
        {p.display_name ? <p className="text-lg">{p.display_name}</p> : null}
        {p.expertise_tag ? (
          <p className="mt-2 inline-block rounded-full bg-secondary px-3 py-1 text-base font-semibold text-secondary-foreground">
            {p.expertise_tag}
          </p>
        ) : null}
        {p.bio ? <p className="mt-3 text-lg">{p.bio}</p> : null}
        <p className="mt-3 text-base text-muted-foreground">Strategist since {memberSince.format(new Date(p.created_at))}</p>
        <Link href="/profile" className="mt-2 inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
          Edit your profile
        </Link>
      </section>

      <section aria-labelledby="dossier-titles" className="flex flex-col gap-3">
        <h2 id="dossier-titles" className="flex items-center gap-2 text-2xl font-semibold">
          <Medal aria-hidden className="size-6 text-primary" /> Titles
        </h2>
        <EmptyState title="No titles yet">
          Win a Campaign to be named Grand Strategist. Your title will be shown here for good.
        </EmptyState>
      </section>

      <section aria-labelledby="dossier-awards" className="flex flex-col gap-3">
        <h2 id="dossier-awards" className="flex items-center gap-2 text-2xl font-semibold">
          <Award aria-hidden className="size-6 text-primary" /> Awards
        </h2>
        <EmptyState title="No awards yet">
          Awards such as Best rebuttal and Best evidence are given when each Campaign closes.
        </EmptyState>
      </section>

      <section aria-labelledby="dossier-dispatches" className="flex flex-col gap-3">
        <h2 id="dossier-dispatches" className="flex items-center gap-2 text-2xl font-semibold">
          <FileText aria-hidden className="size-6 text-primary" /> Dispatches
        </h2>
        <EmptyState
          title="No Dispatches yet"
          action={
            <Button asChild variant="secondary">
              <Link href="/campaigns">See Campaigns</Link>
            </Button>
          }
        >
          A Dispatch is your argument, rebuttal or evidence in a Campaign. When you post one, it will appear here.
        </EmptyState>
      </section>
    </Page>
  );
}
