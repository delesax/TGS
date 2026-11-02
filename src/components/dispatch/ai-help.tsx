"use client";

import * as React from "react";
import { MessageCircleQuestion, ThumbsDown, ThumbsUp } from "lucide-react";
import { checkTone, getCoachFeedback, rateCoachFeedback, type CoachReply } from "@/app/campaigns/[slug]/dispatch-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Private AI help while composing: a tone check and the coach. Nothing here is
// shown to anyone else, and neither ever blocks posting. The coach asks
// questions and points at weaknesses; it never writes text for you.

const RATING_WORDS: Record<string, string> = {
  clear: "Clear",
  partly_clear: "Partly clear",
  unclear: "Unclear",
  strong: "Strong",
  some: "Some",
  none: "None yet",
  acknowledged: "Acknowledged",
  partly: "Partly",
  missing: "Missing",
  constructive: "Constructive",
  mixed: "Mixed",
  hostile: "Hostile",
};

const COACH_FAIL: Record<string, string> = {
  draft_limit: "You have used the coach as many times as allowed for this draft.",
  daily_limit: "You have reached today's limit for AI feedback. Try again tomorrow.",
  too_long: "This draft is too long for the coach.",
  unavailable: "Feedback is not available at the moment. You can still post.",
  signed_out: "Please sign in first.",
  invalid: "Write your draft first, then ask for feedback.",
};

function NudgeNote({ nudge }: { nudge: string }) {
  return (
    <p role="note" className="rounded-lg border-2 border-accent-foreground bg-accent p-3 text-lg text-accent-foreground">
      <strong>A private note:</strong> {nudge} <span className="text-base">Only you can see this.</span>
    </p>
  );
}

export function AiHelp({ campaignId, kind, body, draftKey, usesPerDraft }: { campaignId: string; kind: string; body: string; draftKey: string; usesPerDraft: number }) {
  const [tone, setTone] = React.useState<{ text: string; nudge: boolean } | null>(null);
  const [checking, startCheck] = React.useTransition();
  const [coach, setCoach] = React.useState<CoachReply | null>(null);
  const [coaching, startCoach] = React.useTransition();
  const empty = !body.trim();
  const usesLeft = coach ? coach.usesLeft : usesPerDraft;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <p className="text-base text-muted-foreground">
        Optional, private help from AI. Your draft is sent to our AI provider to check it, and is not stored. Nothing here is shown to anyone else.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          disabled={empty || checking}
          onClick={() =>
            startCheck(async () => {
              const result = await checkTone(campaignId, body);
              setTone(result.ok ? { text: result.nudge ?? "Nothing to flag: this argues with ideas, not people.", nudge: Boolean(result.nudge) } : { text: result.message, nudge: false });
            })
          }
        >
          {checking ? "Checking…" : "Check my tone"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={empty || coaching || usesLeft <= 0}
          onClick={() => startCoach(async () => setCoach(await getCoachFeedback(campaignId, body, kind, draftKey)))}
        >
          <MessageCircleQuestion aria-hidden /> {coaching ? "Reading your draft…" : `Get feedback (${Math.max(0, usesLeft)} left)`}
        </Button>
      </div>
      {tone ? (
        tone.nudge ? (
          <NudgeNote nudge={tone.text} />
        ) : (
          <p role="status" className="text-lg">
            {tone.text}
          </p>
        )
      ) : null}
      {coach ? coach.ok ? <CoachFeedback reply={coach} /> : <p role="status" className="text-lg font-semibold">{COACH_FAIL[coach.reason]}</p> : null}
    </div>
  );
}

function CoachFeedback({ reply }: { reply: Extract<CoachReply, { ok: true }> }) {
  const f = reply.feedback;
  const rows: [string, { rating: string; comment: string }][] = [
    ["Clarity of your claim", f.clarity],
    ["Use of evidence", f.evidence],
    ["The strongest opposing point", f.steelman],
    ["Tone", f.tone],
  ];
  return (
    <section aria-label="Feedback on your draft" className="flex flex-col gap-3 rounded-lg bg-muted p-3">
      <dl className="flex flex-col gap-2">
        {rows.map(([title, point]) => (
          <div key={title}>
            <dt className="text-lg font-semibold">
              {title}: {RATING_WORDS[point.rating] ?? point.rating}
            </dt>
            <dd className="text-lg">{point.comment}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-lg font-semibold">Questions to consider</p>
        <ul className="list-disc pl-6 text-lg">
          {f.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </div>
      <p className="text-base text-muted-foreground">The coach asks questions and points at weaknesses. The argument and the words stay yours.</p>
      <RateFeedback decisionId={reply.decisionId} />
    </section>
  );
}

function RateFeedback({ decisionId }: { decisionId: string }) {
  const [helpful, setHelpful] = React.useState<boolean | null>(null);
  const [comment, setComment] = React.useState("");
  const [state, setState] = React.useState<"idle" | "saved" | string>("idle");
  const [pending, start] = React.useTransition();
  const save = (value: boolean, text: string) =>
    start(async () => {
      setHelpful(value);
      const result = await rateCoachFeedback(decisionId, value, text);
      setState(result.ok ? "saved" : result.message);
    });
  return (
    <div role="group" aria-label="Was this feedback useful?" className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-lg font-semibold">Was this useful?</p>
      <div className="flex gap-2">
        <Button type="button" variant={helpful === true ? "default" : "outline"} aria-pressed={helpful === true} disabled={pending} onClick={() => save(true, comment)}>
          <ThumbsUp aria-hidden /> Yes
        </Button>
        <Button type="button" variant={helpful === false ? "default" : "outline"} aria-pressed={helpful === false} disabled={pending} onClick={() => save(false, comment)}>
          <ThumbsDown aria-hidden /> No
        </Button>
      </div>
      {helpful !== null ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`coach-comment-${decisionId}`}>Anything to add? (optional, do not paste your draft)</Label>
          <Textarea id={`coach-comment-${decisionId}`} rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button type="button" variant="secondary" className="self-start" disabled={pending} onClick={() => save(helpful, comment)}>
            Send comment
          </Button>
        </div>
      ) : null}
      {state === "saved" ? <p role="status" className="text-base">Thank you. Your rating helps us improve the coach.</p> : state !== "idle" ? <p role="alert" className="text-base font-semibold text-destructive">{state}</p> : null}
    </div>
  );
}
