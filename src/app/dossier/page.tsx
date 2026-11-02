import type { Metadata } from "next";
import Link from "next/link";
import { Award, Bell, FileText, Medal } from "lucide-react";
import { DispatchSummaryItem, SUMMARY_COLUMNS, type DispatchSummary } from "@/components/dispatch/dispatch-summary";
import { FollowStrategistButton } from "@/components/dispatch/follow-strategist-button";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireStrategist } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your Dossier" };
export const dynamic = "force-dynamic";

/** The Dossier lists up to this many of your Dispatches, newest first. */
const DOSSIER_LIMIT = 200;

type FollowedCampaign = { campaign: { slug: string; title: string } | null };
type FollowedStrategist = { followed: { id: string; handle: string | null } | null };

const memberSince = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export default async function DossierPage({ searchParams }: PageProps<"/dossier">) {
  const viewer = await requireStrategist("/dossier");
  const { welcome } = await searchParams;
  const p = viewer.profile;

  const supabase = await createClient();
  const [{ data: dispatchRows }, { data: campaignFollows }, { data: strategistFollows }] = await Promise.all([
    supabase.from("dispatches").select(SUMMARY_COLUMNS).eq("author_id", viewer.userId).order("created_at", { ascending: false }).limit(DOSSIER_LIMIT),
    supabase.from("campaign_follows").select("campaign:campaigns(slug, title)").eq("user_id", viewer.userId).order("created_at", { ascending: false }),
    supabase
      .from("strategist_follows")
      .select("followed:profiles!strategist_follows_followed_id_fkey(id, handle)")
      .eq("follower_id", viewer.userId)
      .order("created_at", { ascending: false }),
  ]);
  const dispatches = (dispatchRows as unknown as DispatchSummary[]) ?? [];
  // Group by Campaign, keeping the order of each Campaign's newest Dispatch.
  const groups = new Map<string, { title: string; slug: string; items: DispatchSummary[] }>();
  for (const d of dispatches) {
    const key = d.campaign?.slug ?? "unknown";
    if (!groups.has(key)) groups.set(key, { title: d.campaign?.title ?? "A Campaign", slug: key, items: [] });
    groups.get(key)!.items.push(d);
  }
  const followedCampaigns = ((campaignFollows as unknown as FollowedCampaign[]) ?? []).flatMap((f) => (f.campaign ? [f.campaign] : []));
  const followedStrategists = ((strategistFollows as unknown as FollowedStrategist[]) ?? []).flatMap((f) =>
    f.followed?.handle ? [{ id: f.followed.id, handle: f.followed.handle }] : [],
  );

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
        {groups.size ? (
          <div className="flex flex-col gap-6">
            {[...groups.values()].map((g) => (
              <section key={g.slug} aria-label={`Your Dispatches in ${g.title}`} className="flex flex-col gap-3">
                <h3 className="text-xl font-semibold">
                  <Link href={`/campaigns/${g.slug}`} className="text-primary underline underline-offset-2">
                    {g.title}
                  </Link>{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    ({g.items.length} Dispatch{g.items.length === 1 ? "" : "es"})
                  </span>
                </h3>
                <ul className="flex flex-col gap-3">
                  {g.items.map((d) => (
                    <DispatchSummaryItem key={d.id} d={d} />
                  ))}
                </ul>
              </section>
            ))}
            {dispatches.length === DOSSIER_LIMIT ? <p className="text-base text-muted-foreground">Showing your {DOSSIER_LIMIT} most recent Dispatches.</p> : null}
          </div>
        ) : (
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
        )}
      </section>

      <section aria-labelledby="dossier-following" className="flex flex-col gap-3">
        <h2 id="dossier-following" className="flex items-center gap-2 text-2xl font-semibold">
          <Bell aria-hidden className="size-6 text-primary" /> Following
        </h2>
        <p className="text-lg text-muted-foreground">Only you can see who and what you follow. You follow a Campaign automatically when you post in it.</p>
        <h3 className="text-xl font-semibold">Campaigns</h3>
        {followedCampaigns.length ? (
          <ul className="flex flex-col gap-2">
            {followedCampaigns.map((c) => (
              <li key={c.slug}>
                <Link href={`/campaigns/${c.slug}`} className="inline-flex min-h-12 items-center text-lg text-primary underline [overflow-wrap:anywhere]">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg">You do not follow any Campaigns yet. Use Follow this Campaign on a Campaign page.</p>
        )}
        <h3 className="text-xl font-semibold">Strategists</h3>
        {followedStrategists.length ? (
          <ul className="flex flex-col gap-3">
            {followedStrategists.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/strategists/${s.handle}`} className="inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
                  @{s.handle}
                </Link>
                <FollowStrategistButton id={s.id} handle={s.handle} following compact />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg">You do not follow any Strategists yet. Open a Strategist&apos;s page from a Dispatch to follow them.</p>
        )}
      </section>
    </Page>
  );
}
