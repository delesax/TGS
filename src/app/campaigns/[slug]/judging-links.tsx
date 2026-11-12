import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getJudgingWindow } from "@/lib/judging/data";

/** On a closed Campaign: the Verdict once published, and peer voting while it is open. */
export async function JudgingLinks({ slug, campaignId }: { slug: string; campaignId: string }) {
  const window = await getJudgingWindow(campaignId);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg">
        {window.live
          ? "The Verdict has been published."
          : window.peerOpen
            ? "Peer voting is open. The Verdict will be published once judging is complete."
            : "Judging is under way. The Verdict will be published on its own page."}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href={`/campaigns/${slug}/verdict`}>{window.live ? "Read the Verdict" : "About the Verdict"}</Link>
        </Button>
        {window.peerOpen ? (
          <Button asChild variant="outline">
            <Link href={`/campaigns/${slug}/vote`}>Vote on the Dispatches</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
