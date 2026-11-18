import { CheckboxField, TextAreaField, TextField } from "@/components/form";
import { formatUkDateTime, formatUkShort } from "@/lib/campaigns";
import { KIND_LABELS } from "@/lib/dispatches";
import type { JudgingDispatch } from "@/lib/judging/data";
import { createClient } from "@/lib/supabase/server";
import { approveSummary, draftSummary, removeSummary } from "../actions";
import { AdminForm } from "../forms";

// "The winning case": an AI-drafted summary of the winner's own Dispatches. Drafting is on demand, an admin edits and approves it
// while the Verdict is a draft, and only approved text can reach the public Verdict. Removal is allowed at any status.

export type SummaryState = {
  /** False when the database update (migration) has not been applied yet. */
  available: boolean;
  approved: {
    text: string;
    dispatchId: string | null;
    aiAssisted: boolean;
    model: string | null;
    promptVersion: string | null;
    editedAt: string | null;
    approvedAt: string | null;
  } | null;
  pending: { id: string; text: string; dispatchId: string | null; model: string; promptVersion: string; createdAt: string; cost: number | null } | null;
};

/** Read through the admin's own session (row-level security), tolerant of the columns not existing yet. */
export async function loadSummaryState(verdictId: string): Promise<SummaryState> {
  const supabase = await createClient();
  const { data: v, error } = await supabase
    .from("verdicts")
    .select("winner_summary, winner_summary_dispatch_id, winner_summary_ai_assisted, winner_summary_model, winner_summary_prompt_version, winner_summary_edited_at, winner_summary_approved_at")
    .eq("id", verdictId)
    .maybeSingle();
  if (error) return { available: false, approved: null, pending: null };
  const { data: d } = await supabase
    .from("verdict_summary_drafts")
    .select("id, summary, best_dispatch_id, model, prompt_version, created_at, output")
    .eq("verdict_id", verdictId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    available: true,
    approved: v?.winner_summary
      ? {
          text: v.winner_summary as string,
          dispatchId: (v.winner_summary_dispatch_id as string | null) ?? null,
          aiAssisted: Boolean(v.winner_summary_ai_assisted),
          model: (v.winner_summary_model as string | null) ?? null,
          promptVersion: (v.winner_summary_prompt_version as string | null) ?? null,
          editedAt: (v.winner_summary_edited_at as string | null) ?? null,
          approvedAt: (v.winner_summary_approved_at as string | null) ?? null,
        }
      : null,
    pending: d
      ? {
          id: d.id as string,
          text: d.summary as string,
          dispatchId: (d.best_dispatch_id as string | null) ?? null,
          model: d.model as string,
          promptVersion: d.prompt_version as string,
          createdAt: d.created_at as string,
          cost: ((d.output as { usage?: { estimated_cost_usd?: number } } | null)?.usage?.estimated_cost_usd as number | undefined) ?? null,
        }
      : null,
  };
}

export const SUMMARY_LABEL_AI = "Summary drafted by AI from the winner's Dispatches and reviewed by an admin";
export const SUMMARY_LABEL_HUMAN = "Summary written by an admin";

function dispatchOptions(dispatches: JudgingDispatch[], winnerId: string | null) {
  return dispatches.filter((d) => d.author_id === winnerId);
}

export function SummaryBlock({
  verdictId,
  campaignId,
  isDraft,
  winnerId,
  state,
  dispatches,
}: {
  verdictId: string;
  campaignId: string;
  isDraft: boolean;
  winnerId: string | null;
  state: SummaryState;
  dispatches: JudgingDispatch[];
}) {
  const hidden = { campaignId, verdictId };
  const options = dispatchOptions(dispatches, winnerId);
  const { approved, pending } = state;

  if (!state.available) {
    return (
      <p className="help" role="note">
        The winner&apos;s summary is not available until the database update for it has been applied.
      </p>
    );
  }
  const startText = pending?.text ?? approved?.text ?? "";
  const startDispatch = pending?.dispatchId ?? approved?.dispatchId ?? "";

  return (
    <section aria-labelledby={`summary-h-${verdictId}`} className="flex flex-col gap-3 surface-card p-4">
      <h3 id={`summary-h-${verdictId}`}>Winner&apos;s summary</h3>
      <p className="help">
        An optional short summary of the winner&apos;s own Dispatches, shown under the Grand Strategist card. AI can draft it, but nothing is shown until you approve it, and it never
        affects scores, rankings or awards.
      </p>

      {approved ? (
        <div className="flex flex-col gap-2 rounded-[10px] border border-hairline bg-muted/40 p-3" data-testid="summary-approved">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Approved, as it will appear</p>
          <p className="max-w-[65ch] text-base leading-[1.7]">{approved.text}</p>
          <p className="help">
            {approved.aiAssisted ? SUMMARY_LABEL_AI : SUMMARY_LABEL_HUMAN}
            {approved.aiAssisted && approved.model ? ` (${approved.model}, ${approved.promptVersion})` : ""}
            {approved.editedAt ? `. Edited by an admin ${formatUkDateTime(approved.editedAt)}` : ""}.
          </p>
        </div>
      ) : (
        <p className="text-base" data-testid="summary-none">
          No summary is approved. None will be shown on the Verdict.
        </p>
      )}

      {isDraft && winnerId ? (
        <div className="flex flex-col gap-3">
          <AdminForm action={draftSummary} label="Draft the winner's summary with AI" hidden={hidden} submitLabel={pending || approved ? "Draft again with AI" : "Draft with AI"} pendingLabel="Drafting…">
            <p className="help">
              One short AI call (about 1 to 2 cents). The AI sees only the winner&apos;s own Dispatch text, no names. {pending ? `Latest draft: ${pending.model}, ${pending.promptVersion}${pending.cost !== null ? `, about $${pending.cost.toFixed(3)}` : ""}.` : ""}
            </p>
          </AdminForm>

          <AdminForm action={approveSummary} label="Approve the winner's summary" hidden={hidden} submitLabel="Approve this summary" pendingLabel="Approving…">
            <TextAreaField
              name="summary"
              id={`summary-text-${verdictId}`}
              label={pending ? "AI draft (edit it if needed)" : "Summary (write or edit)"}
              hint="About 100 to 150 words: their position, their strongest arguments, their best evidence and how they answered the other side. Use only what the winner wrote. Check any quotation or figure against the Dispatch."
              rows={8}
              maxLength={1500}
              defaultValue={startText}
              key={`${pending?.id ?? "none"}-${approved?.approvedAt ?? "none"}`}
            />
            <div className="flex flex-col gap-2">
              <label htmlFor={`summary-dispatch-${verdictId}`} className="text-base font-semibold">
                Best Dispatch (for the &ldquo;Read the Dispatch&rdquo; link)
              </label>
              <select id={`summary-dispatch-${verdictId}`} name="dispatchId" defaultValue={startDispatch} className="field">
                <option value="">None</option>
                {options.map((d) => (
                  <option key={d.id} value={d.id}>
                    {KIND_LABELS[d.kind].label}, {formatUkShort(d.created_at)}: {d.body.replace(/\s+/g, " ").slice(0, 70)}
                  </option>
                ))}
              </select>
            </div>
            <CheckboxField name="confirm" id={`summary-confirm-${verdictId}`} label="I have read this summary against the winner's Dispatches. It uses only what they wrote. Approve it for publication with the Verdict." />
          </AdminForm>
        </div>
      ) : null}

      {approved || pending ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-primary underline underline-offset-4">Remove the summary</summary>
          <AdminForm action={removeSummary} label="Remove the winner's summary" hidden={hidden} submitLabel="Remove the summary" pendingLabel="Removing…">
            <TextField name="reason" label="Reason (kept in the audit log, at least 10 characters)" maxLength={500} />
            <p className="help">Removing takes the summary off the public Verdict at once, at any status. Earlier drafts are kept for the record.</p>
          </AdminForm>
        </details>
      ) : null}
    </section>
  );
}
