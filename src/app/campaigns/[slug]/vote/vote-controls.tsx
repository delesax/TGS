"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { castVote, clearMindChangePick, pickMindChanger, setSteelman, withdrawVote, type VoteResult } from "./actions";

/**
 * The controls for one Dispatch. Each button says what it will do; the result
 * stays on screen (announced politely) until the next action.
 */
export function VoteControls(props: {
  dispatchId: string;
  campaignId: string;
  slug: string;
  voted: boolean;
  steelman: boolean;
  picked: boolean;
  canVote: boolean;
  canPick: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<VoteResult | null>(null);
  const act = (fn: () => Promise<VoteResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {props.canVote ? (
          <>
            <Button
              type="button"
              variant={props.voted ? "default" : "outline"}
              aria-pressed={props.voted}
              disabled={pending}
              onClick={() => act(() => (props.voted ? withdrawVote(props.dispatchId, props.slug) : castVote(props.dispatchId, props.slug)))}
              className="whitespace-normal"
            >
              {props.voted ? "Voted (select to remove)" : "Vote for this Dispatch"}
            </Button>
            <Button
              type="button"
              variant={props.steelman ? "default" : "outline"}
              aria-pressed={props.steelman}
              disabled={pending}
              onClick={() => act(() => setSteelman(props.dispatchId, props.slug, !props.steelman))}
              className="whitespace-normal"
            >
              {props.steelman ? "Confirmed: fairly restates the other side" : "It fairly restates the other side"}
            </Button>
          </>
        ) : null}
        {props.canPick ? (
          <Button
            type="button"
            variant={props.picked ? "default" : "outline"}
            aria-pressed={props.picked}
            disabled={pending}
            onClick={() => act(() => (props.picked ? clearMindChangePick(props.campaignId, props.slug) : pickMindChanger(props.dispatchId, props.slug)))}
            className="whitespace-normal"
          >
            {props.picked ? "This changed my mind (select to remove)" : "This changed my mind"}
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className={result && !result.ok ? "text-lg font-semibold text-destructive" : "text-lg"}>
        {pending ? "Saving…" : result ? (result.ok ? result.message : result.error) : ""}
      </p>
    </div>
  );
}
