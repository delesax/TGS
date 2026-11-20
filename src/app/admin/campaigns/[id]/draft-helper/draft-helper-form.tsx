"use client";

import * as React from "react";
import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, TextAreaField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CAMPAIGN_NOTES_MAX_CHARS } from "@/lib/campaign-draft-limits";
import { draftCampaignText, type DraftHelperState } from "./actions";

export const DRAFT_LABEL = "AI draft - verify every fact";
const SUMMARY_LIMIT = 2000; // the Campaign form's Summary limit
const RULES_LIMIT = 10000; // the Campaign form's Rules limit

const fmt = (n: number) => n.toLocaleString("en-GB");

function CopyButton({ text, what }: { text: string; what: string }) {
  const [done, setDone] = React.useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone("copied");
    } catch {
      setDone("failed");
    }
    window.setTimeout(() => setDone("idle"), 3000);
  };
  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" onClick={copy}>
        Copy {what}
      </Button>
      <span role="status" className="text-base">
        {done === "copied" ? "Copied." : done === "failed" ? "Could not copy. Select the text and copy it yourself." : ""}
      </span>
    </div>
  );
}

function Block({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 surface-card p-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-base font-semibold text-accent-foreground">
        {DRAFT_LABEL}
        {note ? <span className="font-normal text-muted-foreground"> ({note})</span> : null}
      </p>
      {children}
    </section>
  );
}

export function DraftHelperForm({ campaignId, rules, rulesNote }: { campaignId: string; rules: string; rulesNote: string | null }) {
  const [state, action, pending] = useActionState(draftCampaignText, {} as DraftHelperState);
  const [notes, setNotes] = React.useState("");
  const errors = state.fieldErrors ?? {};
  const d = state.draft;
  const recheck = d ? d.recheck_lines.join("\n") : "";

  return (
    <div className="flex flex-col gap-6">
      <ActionForm action={action} aria-label="Draft request">
        <input type="hidden" name="campaignId" value={campaignId} />
        <TextAreaField
          name="notes"
          label="Source notes"
          hint={`Paste text only. Links are never opened. Up to ${fmt(CAMPAIGN_NOTES_MAX_CHARS)} characters. Nothing is saved.`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={CAMPAIGN_NOTES_MAX_CHARS}
          rows={12}
          error={errors.notes}
        />
        <p className="text-base text-muted-foreground" aria-live="polite">
          {fmt(notes.length)} of {fmt(CAMPAIGN_NOTES_MAX_CHARS)} characters
        </p>
        <SubmitButton pending={pending} pendingLabel="Drafting…">
          Draft summary, fact-check table and dates
        </SubmitButton>
        <FormMessage state={state} />
      </ActionForm>

      {d ? (
        <>
          <Block title="Draft public summary">
            <Textarea readOnly rows={8} aria-label="Draft public summary" value={d.summary} />
            <p className="text-base text-muted-foreground">
              {fmt(d.summary.length)} of {fmt(SUMMARY_LIMIT)} characters
            </p>
            <CopyButton text={d.summary} what="summary" />
          </Block>

          <Block title="Fact-check table">
            {/* One block per claim on a phone, a four-column table from the small breakpoint up; roles are explicit so both keep table semantics. */}
            <table role="table" className="block w-full text-left text-base sm:table">
              <caption className="sr-only">Every claim in the summary, with its source line and exact quote from your notes</caption>
              <thead role="rowgroup" className="sr-only sm:not-sr-only sm:table-header-group">
                <tr role="row" className="block sm:table-row">
                  {["Claim", "Source line", "Exact quote", "Status"].map((h) => (
                    <th key={h} role="columnheader" scope="col" className="p-2 sm:table-cell">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup" className="block sm:table-row-group">
                {d.claims.map((c, i) => (
                  <tr key={i} role="row" className="block border-t border-hairline py-2 align-top sm:table-row sm:py-0">
                    {(
                      [
                        ["Claim", c.claim],
                        ["Source line", c.source_line],
                        ["Exact quote", c.exact_quote],
                        ["Status", c.status],
                      ] as const
                    ).map(([label, value]) => (
                      <td key={label} role="cell" className={`block break-words p-2 sm:table-cell ${label === "Status" ? "font-semibold" : ""}`}>
                        <span className="block text-sm font-semibold text-muted-foreground sm:hidden">{label}</span>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>

          <Block title="Re-check by">
            {d.recheck_lines.length ? (
              <>
                <Textarea readOnly rows={Math.min(8, d.recheck_lines.length + 1)} aria-label="Re-check by dates" value={recheck} />
                <CopyButton text={recheck} what="dates" />
              </>
            ) : (
              <p className="text-base">No date to re-check was found in your notes.</p>
            )}
          </Block>
        </>
      ) : null}

      <Block title="Rules" note="Rules: built by the site from the live limits, not by the AI. It needs no notes">
        {rulesNote ? <p className="text-base">{rulesNote}</p> : null}
        <Textarea readOnly rows={10} aria-label="Rules text" value={rules} />
        <p className="text-base text-muted-foreground">
          {fmt(rules.length)} of {fmt(RULES_LIMIT)} characters
        </p>
        <CopyButton text={rules} what="rules" />
      </Block>

      {state.usage ? (
        <p className="text-base text-muted-foreground">
          One AI call: {fmt(state.usage.inputTokens)} input and {fmt(state.usage.outputTokens)} output tokens, an estimated ${state.usage.estimatedCostUsd.toFixed(4)}. Counted in today&apos;s AI limit.
        </p>
      ) : null}
    </div>
  );
}
