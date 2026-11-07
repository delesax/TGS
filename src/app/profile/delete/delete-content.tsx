import Link from "next/link";
import { Download } from "lucide-react";
import { FactEmail, InlineLink, Pending } from "@/components/legal-ui";
import { Button } from "@/components/ui/button";

/**
 * The wording of the delete-my-account pages, kept apart from the data loading
 * so it can be rendered and checked in tests. Wording: docs/LEGAL_WORDING.md.
 */

/**
 * Sentence for the audit record while branch sprint-4-audit-handle (which stops
 * handles being written into the audit log) is NOT merged. Once it is merged and
 * applied, set this to false and the sentence disappears.
 */
export const AUDIT_NOTE_MAY_MENTION_HANDLE = true;

const s = (n: number) => (n === 1 ? "" : "es");

export function DeletionOffContent() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg">
        Self-service deletion is not switched on yet during this closed test. To delete your account now, use the{" "}
        <InlineLink href="/privacy/contact">Contact us about your data</InlineLink> form or email <FactEmail k="privacyEmail" /> from the address on your
        account. We will delete it by hand and confirm within one month.
      </p>
      <Button asChild variant="outline" className="self-start">
        <Link href="/profile">Back to your account</Link>
      </Button>
    </div>
  );
}

export function DeletionOnContent({ handle, count, confirm }: { handle: string; count: number; confirm: React.ReactNode }) {
  return (
    <>
      <section aria-labelledby="first-h" className="flex flex-col gap-3">
        <h2 id="first-h" className="text-2xl font-bold">
          1. Download your data first
        </h2>
        <p className="text-lg">Once your account is deleted we cannot give you a copy.</p>
        <Button asChild variant="secondary" className="self-start">
          <a href="/profile/export" download>
            <Download aria-hidden /> Download my data
          </a>
        </Button>
      </section>
      <section aria-labelledby="what-h" className="flex flex-col gap-3">
        <h2 id="what-h" className="text-2xl font-bold">
          2. What happens
        </h2>
        <p className="text-lg font-semibold">Removed for good:</p>
        <ul className="list-disc space-y-1 pl-6 text-lg">
          <li>your email address and sign-in, including passkeys</li>
          <li>your handle @{handle}, name, expertise and bio</li>
          <li>your reactions, who and what you follow, and your email settings</li>
          <li>your private tone-check and coach records</li>
          <li>your positions on Campaigns that are still open</li>
          <li>your consent records for positions</li>
        </ul>
        <p className="text-lg font-semibold">Stays, without your name:</p>
        <ul className="list-disc space-y-3 pl-6 text-lg">
          <li>
            Your {count} Dispatch{s(count)}. You published them in public debates, and Verdicts and the record of each debate rely on them. After deletion
            they show as by &lsquo;a deleted Strategist&rsquo; and are no longer linked to your name or email. If a Dispatch says something that identifies
            you, readers could still recognise you from it. To ask us to remove a particular Dispatch, use the{" "}
            <InlineLink href="/privacy/contact">Contact us about your data</InlineLink> form or email <FactEmail k="privacyEmail" /> before you delete, and
            say which one. We will consider each request and reply within one month.
          </li>
          <li>Your positions on closed Campaigns, kept with no link to you, so we can measure how minds change.</li>
          <li>
            A safety and accountability record of actions on the site, such as moderation decisions and appeals. It uses a reference number, not your
            name. We keep it for <Pending>six years</Pending> to deal with complaints and legal claims, then delete it.
            {AUDIT_NOTE_MAY_MENTION_HANDLE ? " In rare cases a moderator’s note may mention your handle." : null}
          </li>
        </ul>
      </section>
      <section aria-labelledby="confirm-h" className="flex flex-col gap-3">
        <h2 id="confirm-h" className="text-2xl font-bold">
          3. Confirm
        </h2>
        {confirm}
        <Button asChild variant="outline">
          <Link href="/profile">Keep my account</Link>
        </Button>
      </section>
    </>
  );
}

export function AccountDeletedContent({ n }: { n: number }) {
  return (
    <>
      <p className="text-lg">
        We have removed your email address, sign-in, passkeys, handle and profile. Your {n} Dispatch{s(n)} stay{n === 1 ? "s" : ""} in the debates, shown
        as by &lsquo;a deleted Strategist&rsquo;. We keep a record of safety and accountability actions for <Pending>six years</Pending>, then delete it.
        To ask us about your data, use the <InlineLink href="/privacy/contact">Contact us about your data</InlineLink> form or email{" "}
        <FactEmail k="privacyEmail" />. If you are unhappy with how we handled it, you can complain to the Information Commissioner&apos;s Office at
        ico.org.uk.
      </p>
      <Button asChild className="self-start">
        <Link href="/">Go to the home page</Link>
      </Button>
    </>
  );
}
