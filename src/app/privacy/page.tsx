import type { Metadata } from "next";
import { DraftNotice, Page } from "@/components/page";

export const metadata: Metadata = { title: "Privacy policy (draft)" };

export default function PrivacyPage() {
  return (
    <Page title="Privacy policy" intro="DRAFT. Placeholder text for the invite-only pilot.">
      <DraftNotice />
      <div className="flex flex-col gap-4 text-lg">
        <h2 className="text-2xl font-semibold">[DRAFT] Who we are</h2>
        <p>[Placeholder] The data controller, company details and contact address will be added here.</p>
        <h2 className="text-2xl font-semibold">[DRAFT] What we collect</h2>
        <p>
          [Placeholder] During the pilot we keep the minimum: your email address, your handle, anything you choose to add to
          your profile, your confirmation that you are 18 or over, the invite code you used, and the passkeys you add.
        </p>
        <h2 className="text-2xl font-semibold">[DRAFT] Why we use it, and our lawful basis</h2>
        <p>[Placeholder] To be written and reviewed under UK GDPR.</p>
        {/* OWNER DECISION 5: needs the owner's and a lawyer's approval (UK GDPR) before real invitees arrive. */}
        <h2 className="text-2xl font-semibold">[DRAFT] Automated checks by AI</h2>
        <p>
          [Placeholder, needs legal review] To keep debates safe, the text of every Dispatch and every handle is sent to our AI provider, Anthropic, to
          check it against our community rules. If you ask for feedback or a tone check, your draft is sent too. We send only the text and the
          Campaign&apos;s question and topic, never your name, email address or other details. The AI can hold a Dispatch for a person to check; it
          never deletes anything, and a person reviews every hold and every appeal. We keep a record of each AI decision and of coach feedback, but not
          your drafts.
        </p>
        <h2 className="text-2xl font-semibold">[DRAFT] How long we keep it</h2>
        <p>[Placeholder] Retention periods to be confirmed.</p>
        <h2 className="text-2xl font-semibold">[DRAFT] Your rights</h2>
        <p>[Placeholder] How to see, download, correct or delete your data, and how to complain to the ICO.</p>
        <h2 className="text-2xl font-semibold">[DRAFT] Cookies and analytics</h2>
        <p>[Placeholder] We only use cookies needed to keep you signed in. Any analytics will ask for your consent first.</p>
      </div>
    </Page>
  );
}
