import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DispatchSummaryItem, SUMMARY_COLUMNS, type DispatchSummary } from "@/components/dispatch/dispatch-summary";
import { FollowStrategistButton } from "@/components/dispatch/follow-strategist-button";
import { TitlesAndAwards } from "@/components/judging/awards-section";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { getAwardsFor } from "@/lib/judging/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const HANDLE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const memberSince = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

type PublicProfile = { id: string; handle: string; display_name?: string | null; expertise_tag?: string | null; bio?: string | null; created_at: string };

// Visitors who are not signed in see only the handle and join date (the
// database grants them nothing more); signed-in Strategists also see the rest.
const PUBLIC_COLUMNS = "id, handle, created_at";
const MEMBER_COLUMNS = "id, handle, display_name, expertise_tag, bio, created_at";

async function getProfile(handle: string, signedIn: boolean): Promise<PublicProfile | null> {
  if (!HANDLE.test(handle)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(signedIn ? MEMBER_COLUMNS : PUBLIC_COLUMNS)
    .ilike("handle", handle.replace(/_/g, "\\_"))
    .maybeSingle<PublicProfile>();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/strategists/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  return { title: HANDLE.test(handle) ? `@${handle}` : "Strategist not found" };
}

export default async function StrategistPage({ params }: PageProps<"/strategists/[handle]">) {
  const { handle } = await params;
  const viewer = await getViewer();
  const profile = await getProfile(handle, Boolean(viewer));
  if (!profile) notFound();

  const supabase = await createClient();
  const [{ data: dispatches }, { data: follow }, awards] = await Promise.all([
    supabase
      .from("dispatches")
      .select(SUMMARY_COLUMNS)
      .eq("author_id", profile.id)
      .eq("moderation_status", "visible")
      .order("created_at", { ascending: false })
      .limit(20),
    viewer?.profile?.handle && viewer.userId !== profile.id
      ? supabase.from("strategist_follows").select("followed_id").eq("follower_id", viewer.userId).eq("followed_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
    getAwardsFor(profile.id),
  ]);
  const list = (dispatches as unknown as DispatchSummary[]) ?? [];
  const isMe = viewer?.userId === profile.id;

  return (
    <Page title={`@${profile.handle}`} intro={profile.display_name ?? undefined}>
      <section aria-label="About" className="flex flex-col gap-3 rounded-xl border border-border p-5">
        {profile.expertise_tag ? (
          <p className="inline-block self-start rounded-full bg-secondary px-3 py-1 text-base font-semibold text-secondary-foreground">{profile.expertise_tag}</p>
        ) : null}
        {profile.bio ? <p className="text-lg">{profile.bio}</p> : null}
        <p className="text-base text-muted-foreground">Strategist since {memberSince.format(new Date(profile.created_at))}</p>
        {isMe ? (
          <Button asChild variant="outline" className="self-start">
            <Link href="/dossier">This is you. Go to your Dossier</Link>
          </Button>
        ) : viewer?.profile?.handle ? (
          <FollowStrategistButton id={profile.id} handle={profile.handle} following={Boolean(follow)} />
        ) : (
          <Button asChild variant="outline" className="self-start">
            <Link href={`/login?next=${encodeURIComponent(`/strategists/${profile.handle}`)}`}>Sign in to follow</Link>
          </Button>
        )}
      </section>

      <TitlesAndAwards awards={awards} own={isMe} />

      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <h2 id="recent-heading" className="text-2xl font-semibold">
          Recent Dispatches
        </h2>
        {list.length ? (
          <ul className="flex flex-col gap-3">
            {list.map((d) => (
              <DispatchSummaryItem key={d.id} d={d} />
            ))}
          </ul>
        ) : (
          <EmptyState title="No Dispatches yet">@{profile.handle} has not posted in a Campaign yet.</EmptyState>
        )}
      </section>

      <Button asChild variant="secondary" className="self-start">
        <Link href="/campaigns">See Campaigns</Link>
      </Button>
    </Page>
  );
}
