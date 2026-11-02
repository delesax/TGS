import type { Metadata } from "next";
import { DraftNotice, Page } from "@/components/page";

export const metadata: Metadata = { title: "Terms of use (draft)" };

export default function TermsPage() {
  return (
    <Page title="Terms of use" intro="DRAFT. Placeholder text for the invite-only pilot.">
      <DraftNotice />
      <div className="flex flex-col gap-4 text-lg">
        <h2 className="text-2xl font-semibold">[DRAFT] Who can join</h2>
        <p>[Placeholder] The pilot is invite-only and open to people aged 18 or over.</p>
        <h2 className="text-2xl font-semibold">[DRAFT] Community rules</h2>
        <p>[Placeholder] No hate, harassment or impersonation. Argue the point, not the person.</p>
        <h2 className="text-2xl font-semibold">[DRAFT] Your content</h2>
        <p>[Placeholder] Who owns Dispatches, and the licence you give us to show them.</p>
        <h2 className="text-2xl font-semibold">[DRAFT] Moderation and appeals</h2>
        <p>[Placeholder] How content is held for review, and how to appeal a decision or a Verdict.</p>
        <h2 className="text-2xl font-semibold">[DRAFT] Not advice</h2>
        <p>[Placeholder] Campaigns on financial or medical topics are opinion, not professional advice.</p>
        <h2 className="text-2xl font-semibold">[DRAFT] Ending your account</h2>
        <p>[Placeholder] How you can close your account and what happens to your content.</p>
      </div>
    </Page>
  );
}
