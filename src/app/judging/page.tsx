import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page } from "@/components/page";
import { requireStrategist } from "@/lib/auth";
import { getServerNow } from "@/lib/campaign-data";
import { formatUkDateTime } from "@/lib/campaigns";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your judging" };
export const dynamic = "force-dynamic";

type Assignment = { campaign_id: string; submitted_at: string | null; campaign: { slug: string; title: string; status: string; ends_at: string } | null };

export default async function JudgingListPage() {
  const viewer = await requireStrategist("/judging");
  const supabase = await createClient();
  const [{ data, error }, now] = await Promise.all([
    supabase.from("judge_assignments").select("campaign_id, submitted_at, campaign:campaigns(slug, title, status, ends_at)").eq("judge_id", viewer.userId).order("assigned_at", { ascending: false }),
    getServerNow(),
  ]);
  if (error) throw new Error("Could not load your judging");
  const list = (data as unknown as Assignment[]) ?? [];

  return (
    <Page title="Your judging" intro="Campaigns an admin has asked you to judge. You can score a Campaign once it has closed.">
      {list.length ? (
        <ul className="flex flex-col gap-3">
          {list.map((a) => {
            const closed = a.campaign && (a.campaign.status === "closed" || Date.parse(a.campaign.ends_at) <= now);
            return (
              <li key={a.campaign_id} className="flex flex-col gap-2 rounded-xl border border-border p-4">
                <p className="text-xl font-semibold">{a.campaign?.title ?? "A Campaign"}</p>
                <p className="text-lg">
                  {a.submitted_at
                    ? `Submitted ${formatUkDateTime(a.submitted_at)}. Your scores are locked.`
                    : closed
                      ? "Closed: ready for your scores."
                      : `Opens for judging when it closes on ${a.campaign ? formatUkDateTime(a.campaign.ends_at) : "its deadline"}.`}
                </p>
                {closed ? (
                  <Link href={`/judging/${a.campaign_id}`} className="inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
                    {a.submitted_at ? "See your scores" : "Score the Dispatches"}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="Nothing to judge">You are not on a judging panel. If an admin asks you to judge, the Campaign will appear here and we will email you.</EmptyState>
      )}
    </Page>
  );
}
