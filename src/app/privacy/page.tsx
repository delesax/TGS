import type { Metadata } from "next";
import { Fact, FactEmail, H2, InlineLink, Pending, Prose, StackTable } from "@/components/legal-ui";
import { DraftNotice, Page } from "@/components/page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <Page
      title="Privacy policy"
      intro={
        <>
          Version {LEGAL.privacyVersion}, in force from <Fact k="effectiveDate" />.
        </>
      }
    >
      <DraftNotice />
      <Prose>
        <H2>Who we are</H2>
        <p>
          {LEGAL.companyName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) decides how your personal data is used. Company number <Fact k="companyNumber" />, registered in
          England and Wales, registered office <Fact k="registeredOffice" />. We are registered with the Information Commissioner&apos;s Office (ICO),
          registration number <Fact k="icoNumber" />. You can reach us at <FactEmail k="privacyEmail" /> or through the{" "}
          <InlineLink href="/privacy/contact">Contact us about your data</InlineLink> form. You must be 18 or over to use The Grand Strategist. We do not
          knowingly hold data about anyone under 18. If we find an account belongs to someone under 18, we will close it and delete their data.
        </p>

        <H2>What we collect</H2>
        <p>
          <strong>Your account:</strong> your email address; your password (stored scrambled by our sign-in provider, never readable by us); your
          confirmation that you are 18 or over; the invite code you used; the version of these terms and this policy you accepted; any passkeys you add.
          If someone invited you, we may already hold your email address from that invitation.
        </p>
        <p>
          <strong>Your profile:</strong> your handle, and any name, expertise or bio you choose to add.
        </p>
        <p>
          <strong>What you do on the site:</strong> your Dispatches, your AI-use declarations, reactions, follows, reports and appeals, and your Campaign
          positions if you agree to us recording them.
        </p>
        <p>
          <strong>Messages you send us:</strong> privacy requests and complaints.
        </p>
        <p>
          <strong>Records we make:</strong> decisions about Dispatches and handles (some made with AI), the reasons for them, and a safety and
          accountability record of actions on the site.
        </p>
        <p>
          <strong>Technical data:</strong> our hosting providers keep ordinary security logs, such as your IP address. We use only the cookies needed to keep
          you signed in.
        </p>

        <h2 id="sensitive-subjects" className="mt-4 scroll-mt-4 text-2xl font-semibold">
          Sensitive subjects
        </h2>
        <p>
          We do not ask you about your health, religion, politics or similar subjects. Debates are about public issues, so what you write may reveal them.
        </p>
        <ul className="list-disc space-y-3 pl-6">
          <li>
            <strong>What you publish in a Dispatch:</strong> you are choosing to make it public, and that is the legal condition we rely on for handling it.
          </li>
          <li>
            <strong>Your private positions on Campaigns:</strong> your view on an issue can reveal political opinion, which UK law treats as sensitive. We
            record a position only if you agree first. You can withdraw at any time (see Your rights). We keep positions private, use them only to measure
            how minds change, and publish only anonymous totals.
          </li>
        </ul>

        <H2>Why we use your data</H2>
        <StackTable
          caption="Why we use your data and our legal basis"
          columns={["What we do", "Why", "Our legal basis"]}
          rows={[
            ["Run your account; send the emails you asked for", "To provide the service you signed up for", "Contract"],
            ["Publish Dispatches, run Campaigns, name Verdicts", "To provide the service", "Contract; our legitimate interest in running fair debates"],
            ["Check handles and Dispatches (including with AI), and handle reports and appeals", "To keep debates safe and respectful", "Our legitimate interest"],
            ["Record your positions on Campaigns", "To measure how minds change", "Your explicit consent"],
            ["Keep a record of moderation and account actions", "To deal with complaints and legal claims", "Our legitimate interest"],
            ["Keep logs and limit abuse", "To keep the site secure", "Our legitimate interest"],
            ["Answer your privacy requests and complaints", "To meet our legal duties", "Legal obligation"],
            ["Analytics (only if we add them)", "To improve the service", "Your consent"],
          ]}
        />
        <p>
          Where our basis is legitimate interest, we have weighed our interests against your rights and you can object (see Your rights). We do not send
          marketing emails. The emails we send are about your account and the debates you follow, and each has a link to stop that kind of email.
        </p>

        <H2>Your Dispatches are public</H2>
        <p>
          Dispatches, your handle and your AI-use declarations are shown on the website. Search engines may list them. We cannot stop other people copying
          what is public. Think before you publish personal information about yourself or anyone else. If a Dispatch is about you, mentions you or has your
          personal data in it and you want it looked at, tell us (see Your rights).
        </p>

        <h2 id="automated-checks" className="mt-4 scroll-mt-4 text-2xl font-semibold">Automated checks and AI help</h2>
        <p>
          We use an AI service from Anthropic to help keep debates safe and to help you write better. There are three uses.
        </p>
        <ul className="list-disc space-y-3 pl-6">
          <li>
            <strong>Safety check.</strong> When you choose a handle or post a Dispatch, we send the text, with the Campaign&apos;s question and type, to
            Anthropic to check it against our community rules.
          </li>
          <li>
            <strong>Tone check (optional).</strong> If you press &ldquo;Check my tone&rdquo;, we send your draft.
          </li>
          <li>
            <strong>Coach (optional).</strong> If you press &ldquo;Get feedback&rdquo;, we send your draft. The coach asks questions. It never writes your
            text.
          </li>
        </ul>
        <p>
          We send only the text and the Campaign&apos;s question and type. We do not send your name, email address or profile. We do send your text exactly as
          you wrote it, so anything in it, such as another person&apos;s name, goes too.
        </p>
        <p>
          The AI can hold a Dispatch so that a person reads it first. It cannot delete or remove anything and it never decides alone. A person reviews
          every hold and every appeal. No decision with a legal or similarly significant effect on you is made by AI alone. If the AI is not available, an
          ordinary Dispatch may appear without a check and a person looks at it later. Dispatches on sensitive topics are held until a person has looked.
          You can ask a person to look again at any automated check.
        </p>
        <p>
          For each check we keep a record of the decision and the reason so a moderator can review it. We keep coach feedback and your rating of it. We do
          not keep your draft. See &ldquo;How long we keep it&rdquo;.
        </p>
        <p>
          Anthropic processes this text for us under a data processing agreement. Its current terms say it deletes inputs and outputs within 30 days, may
          keep them longer only to enforce its usage policy or to meet the law, and does not use them to train its models without permission.{" "}
          <Pending>Owner: confirm against Anthropic&apos;s terms on the day you publish</Pending>
        </p>
        <p>
          The tone check and coach are optional. The safety check protects other Strategists, so we cannot switch it off for posting. If you object to it,
          contact us and we will consider it. More in <InlineLink href="/ai-use">How we use AI</InlineLink>.
        </p>

        <H2>Who we share it with</H2>
        <p>
          Companies that work for us (they may use your data only for us): Supabase (database and sign-in), Vercel (hosting), Anthropic (AI checks), Resend
          (email delivery) <Pending>and any others added</Pending>. Moderators and administrators of The Grand Strategist can see what they need to do their
          work. We may disclose data if the law requires it or to protect people from serious harm, and only where we have a proper legal basis. We do not
          sell your data.
        </p>

        <H2>Sending data outside the UK</H2>
        <p>
          Our database is in London. Some of our providers are in, or process data in, the United States or elsewhere (Vercel, Anthropic, and
          Supabase&apos;s company).{" "}
          <Pending>
            Owner: for each, state the safeguard: the UK–US data bridge or the UK&apos;s standard contract terms (the IDTA or the UK Addendum). Resend
            processes in Ireland (EEA)
          </Pending>{" "}
          These safeguards give your data protection equal to UK law.
        </p>

        <H2>How long we keep it</H2>
        <StackTable
          caption="How long we keep each kind of data"
          columns={["Data", "Kept for"]}
          rows={[
            ["Account and profile", "Until you delete your account"],
            ["Sign-ups never confirmed by email", "30 days"],
            ["Dispatches", "In the debate record. Shown without your name after you delete your account"],
            ["Positions on open Campaigns", "Until you clear them, withdraw your consent or delete your account"],
            ["Positions on closed Campaigns", "Private to you and our moderation team until you withdraw your consent or delete your account. After that, kept with no link to you"],
            ["Decisions about Dispatches and handles", "12 months"],
            ["Reports and moderation flags", "12 months after they are resolved"],
            ["Coach feedback and ratings", "90 days"],
            ["Queued and sent emails", "30 days"],
            ["Privacy requests and complaints", <>six years after they are closed <Pending>six years: owner to confirm</Pending></>],
            ["Safety and accountability record", <>six years <Pending>six years: owner to confirm</Pending></>],
            ["Security logs at our providers", "The short periods they set"],
          ]}
        />

        <H2>Deleting your account</H2>
        <p>
          See the <InlineLink href="/profile/delete">Delete my account</InlineLink> page for the full list. In short: your email, sign-in, profile and
          private records go. Your Dispatches stay in the debate record without your name. A safety and accountability record stays for{" "}
          <Pending>six years</Pending>. Until self-service deletion is switched on, email <FactEmail k="privacyEmail" /> from the address on your account.
        </p>

        <H2>Your rights</H2>
        <p>
          You can: see your data (Download my data); have wrong data corrected (edit your profile, or ask us); ask us to delete it; ask us to limit how we
          use it; object to us using it on the basis of our legitimate interest; withdraw a consent you gave (for example, stop recording your positions);
          take your data elsewhere; and ask a person to look again at any automated check. Use the{" "}
          <InlineLink href="/privacy/contact">Contact us about your data</InlineLink> form or email <FactEmail k="privacyEmail" />. We will reply within one
          month. For complicated requests the law lets us take up to two more months, and we will tell you why. It is free. We may ask you to confirm who
          you are, and we normally reply to the email address on your account. We may refuse a request that is clearly unfounded or excessive, or where the
          law lets us keep the data, and we will say why.
        </p>

        <H2>Complaints</H2>
        <p>
          Please tell us first. Use the form or email <FactEmail k="privacyEmail" />. We will acknowledge your complaint within 30 days (we aim for seven),
          look into it, and tell you the outcome without unnecessary delay. You can also complain to the Information Commissioner&apos;s Office at
          ico.org.uk or on 0303 123 1113, at any time.
        </p>

        <H2>Keeping your data safe</H2>
        <p>
          We use encrypted connections, access controls and row-level security so people see only what they should. No system is perfectly secure. If a
          breach puts your rights at serious risk, we will tell you and the ICO as the law requires.
        </p>

        <H2>Cookies and similar technologies</H2>
        <p>
          We use only what is needed to keep you signed in and keep the site secure. We do not use analytics or advertising cookies, and we will ask for your
          agreement first if that ever changes. This is what the site stores on your device:
        </p>
        <StackTable
          caption="Cookies and similar storage used by the site"
          columns={["Name", "What it does", "How long"]}
          rows={[
            ["sb-…-auth-token (a cookie; the middle part is our project code)", "Keeps you signed in. Set only after you sign in.", "Until you sign out, up to about a week without use"],
            ["sb-…-auth-token-code-verifier (a cookie)", "Protects a sign-in or email-confirmation step from being hijacked. Set only during those steps.", "Minutes; removed when the step ends"],
            ["tgs-draft:… (session storage in your browser)", "Keeps an unsent Dispatch if you refresh the page. Never sent to us.", "Until you close the tab"],
            ["tgs-content-note:… (session storage in your browser)", "Remembers you have seen a content note on a sensitive Campaign.", "Until you close the tab"],
            ["tgs-install-dismissed (local storage in your browser)", "Remembers you closed the “add to your home screen” hint.", "Until you clear your browser data"],
            ["tgs-shell-v1 (the app cache)", "Lets the site show an offline page. Holds only pictures and files that are the same for everyone.", "Until the app is updated"],
          ]}
        />
        <p>
          <Pending>Owner: the lifetimes above are the defaults of our sign-in provider and were not measured on the live site. Check them on launch day.</Pending>
        </p>

        <H2>Changes</H2>
        <p>If we change this page in a way that matters, we will tell you by email before it takes effect.</p>
      </Prose>
    </Page>
  );
}
