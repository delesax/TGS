import type { Metadata } from "next";
import { DraftNotice, Page } from "@/components/page";

export const metadata: Metadata = { title: "How we use AI (draft)" };

export default function AiUsePage() {
  return (
    <Page title="How we use AI" intro="DRAFT. Placeholder text for the invite-only pilot.">
      <DraftNotice />
      <div className="flex flex-col gap-4 text-lg">
        <h2 className="text-2xl font-semibold">[DRAFT] Where AI is used</h2>
        <p>[Placeholder] Screening handles and Dispatches against the community rules, private coaching, and one part of judging.</p>
        <h2 className="text-2xl font-semibold">[DRAFT] People stay in charge</h2>
        <p>
          [Placeholder] AI never deletes anything; it can only hold content for a person to review. AI never decides a result on
          its own. Every AI decision is recorded with its reason and can be overruled by an administrator.
        </p>
        <h2 className="text-2xl font-semibold">[DRAFT] Declaring your own AI use</h2>
        <p>
          [Placeholder] Each Dispatch says whether you used AI: none, assisted or generated. This is shown publicly. Posting AI
          output without declaring it may be flagged.
        </p>
        <h2 className="text-2xl font-semibold">[DRAFT] Which provider and what is shared</h2>
        <p>[Placeholder] The AI provider, what text is sent to it, and how long it is kept.</p>
      </div>
    </Page>
  );
}
