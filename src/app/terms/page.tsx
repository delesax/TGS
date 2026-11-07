import type { Metadata } from "next";
import { Fact, FactEmail, H2, InlineLink, Pending, Prose } from "@/components/legal-ui";
import { DraftNotice, Page } from "@/components/page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <Page
      title="Terms of use"
      intro={
        <>
          Version {LEGAL.termsVersion}, in force from <Fact k="effectiveDate" />.
        </>
      }
    >
      <DraftNotice />
      <Prose>
        <H2>About these terms</H2>
        <p>
          These terms are between you and {LEGAL.companyName} (company number <Fact k="companyNumber" />, registered office <Fact k="registeredOffice" />).
          By creating an account you agree to them. Please read them with our <InlineLink href="/privacy">Privacy policy</InlineLink>. The Grand Strategist
          is a pilot: it is invite-only, and features may change.
        </p>

        <H2>Who can join</H2>
        <p>
          You must be 18 or over and have a valid invite. Your invite is personal: do not share your code. Give true information, keep one account, and
          keep your password and passkeys safe. Tell us at once if you think someone else is using your account.
        </p>

        <H2>Community rules</H2>
        <p>
          Argue the point, not the person. You must not post: hate or abuse aimed at people because of who they are; harassment, threats or pile-ons;
          impersonation; content that encourages self-harm or suicide; anything unlawful, including defamatory statements, content that infringes
          someone&apos;s copyright, and other people&apos;s private information; spam, or anything that tries to manipulate a vote or a Verdict. Do not use
          the site to do anything the law forbids.
        </p>

        <H2>Your Dispatches</H2>
        <p>
          You keep the rights in what you write. You give us a non-exclusive, worldwide, royalty-free licence to host, display, copy and format your
          Dispatches on The Grand Strategist, to include them in Verdicts and the debate record, and to have them checked, including by our AI provider as
          described in the Privacy policy. This licence lasts as long as the Dispatch is in the debate record, including after you delete your account (when
          it is shown without your name). You promise that you wrote it or have the right to post it, and that it does not break these terms or the law.
          Quote others briefly and say where it came from.
        </p>

        <H2>Declaring AI use</H2>
        <p>
          Every Dispatch carries a declaration: none, assisted or generated. You must be honest. See <InlineLink href="/ai-use">How we use AI</InlineLink> for
          what each means. A Dispatch declared &ldquo;none&rdquo; that looks like pasted AI text may be flagged for a person to look at. A flag is a prompt
          for a moderator to look, not a finding that you did anything wrong.
        </p>

        <H2>Moderation, removal and appeals</H2>
        <p>
          We may hold, edit the visibility of, or remove a Dispatch or a handle that breaks these terms, and we may mute posting or close an account for
          serious or repeated breaches. We will tell you what we did and why, unless the law stops us. AI may hold a Dispatch for a person to read; it does
          not remove anything and does not decide alone. You can appeal a hold, removal or other decision from the notice we send you; a person decides
          appeals. We aim to answer promptly but cannot promise a time. You can also appeal a Verdict from its page.
        </p>

        <H2>Reporting a Dispatch</H2>
        <p>
          Use the Report button on any Dispatch, or email <FactEmail k="contactEmail" />. For something you believe is unlawful, including defamatory,
          please tell us which Dispatch it is, what is wrong and why, and give your name and email. We will look at it quickly. We may remove the Dispatch,
          or may contact its author. If a person is identified in a defamation complaint we may share the complaint with the author where the law allows or
          requires it.
        </p>

        <H2>Verdicts and judging</H2>
        <p>
          Verdicts blend a panel, peer votes, an AI rubric and the movement of positions. The weights and rubric are published before a Campaign opens. A
          person approves outcomes, and AI never decides alone. Titles and awards have no cash value. We make the final decision, subject to the appeal
          process.
        </p>

        <H2>Opinion, not advice</H2>
        <p>
          Campaigns on money, health, law or similar subjects are opinion and debate, not professional advice. Do not rely on anything you read here to make
          a financial, medical or legal decision. Ask a qualified professional.
        </p>

        <H2>Sensitive Campaigns</H2>
        <p>
          Some Campaigns have a content note and stricter moderation. The Grand Strategist is not a crisis or support service. If you are struggling,
          Samaritans are free on 116 123, at any time.
        </p>

        <H2>Closing your account</H2>
        <p>
          You can close your account at any time. Until self-service deletion is switched on, email <FactEmail k="privacyEmail" /> from the address on your
          account. What is removed and what stays is explained on the <InlineLink href="/profile/delete">Delete my account</InlineLink> page and in the
          Privacy policy. We may suspend or close your account if you break these terms.
        </p>

        <H2>Our responsibility to you</H2>
        <p>
          Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by our negligence, or for
          fraud. The Grand Strategist is provided as it is during the pilot and we do not promise it will always be available or error-free. We are not
          responsible for what Strategists post, but we will act on reports as set out above. Otherwise, we are not liable for losses that were not
          reasonably foreseeable, or for loss of business or profit, and our total liability to you for any one matter is limited to £100{" "}
          <Pending>Owner/solicitor: confirm this cap</Pending>. These limits do not affect your legal rights.
        </p>

        <H2>Changes, law and contact</H2>
        <p>
          We may change these terms. For changes that matter we will email you at least 14 days before they take effect, and you can close your account
          instead of accepting them. These terms are governed by the law of {LEGAL.jurisdiction} and the courts of {LEGAL.jurisdiction}; if you live in
          Scotland or Northern Ireland you may use your local courts. Questions: <FactEmail k="contactEmail" />.
        </p>
      </Prose>
    </Page>
  );
}
