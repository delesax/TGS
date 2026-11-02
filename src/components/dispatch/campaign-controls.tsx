"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { setCampaignFollow } from "@/app/campaigns/[slug]/dispatch-actions";
import { Button } from "@/components/ui/button";

export function FollowCampaignButton({ campaignId, slug, following }: { campaignId: string; slug: string; following: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={following ? "outline" : "secondary"}
        aria-pressed={following}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setCampaignFollow(campaignId, slug, !following);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {following ? <BellOff aria-hidden /> : <Bell aria-hidden />}
        {pending ? "Saving…" : following ? "Following. Stop following" : "Follow this Campaign"}
      </Button>
      {error ? (
        <p role="alert" className="text-base font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const noSubscribe = () => () => {};

/**
 * Sensitive Campaigns: Dispatches stay folded away until the reader has seen
 * the content note and chosen to continue. Remembered for this tab only.
 */
export function ContentGate({ campaignId, note, children }: { campaignId: string; note: string; children: React.ReactNode }) {
  const key = `tgs-content-note:${campaignId}`;
  const seen = React.useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return window.sessionStorage.getItem(key) === "seen";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [open, setOpen] = React.useState(false);

  if (open || seen) return <>{children}</>;
  return (
    <section aria-label="Content note before the Dispatches" className="flex flex-col gap-3 rounded-xl border-2 border-accent-foreground bg-accent p-5 text-accent-foreground">
      <h3 className="text-xl font-bold">Content note</h3>
      <p className="whitespace-pre-line text-lg">{note}</p>
      <p className="text-lg">The Dispatches below may discuss this. You can stop reading at any time.</p>
      <Button
        type="button"
        className="self-start"
        onClick={() => {
          setOpen(true);
          try {
            window.sessionStorage.setItem(key, "seen");
          } catch {}
        }}
      >
        I have read the note. Show the Dispatches
      </Button>
    </section>
  );
}
