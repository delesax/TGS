import type { Metadata } from "next";
import { H2, InlineLink, Prose } from "@/components/legal-ui";
import { DraftNotice, Page } from "@/components/page";

export const metadata: Metadata = { title: "How we use AI" };

export default function AiUsePage() {
  return (
    <Page title="How we use AI" intro="Two parts: the label on every Dispatch, and what happens behind the scenes.">
      <DraftNotice />
      <Prose>
        <H2>What the AI-use label means on a Dispatch</H2>
        <ul className="list-disc space-y-3 pl-6">
          <li>
            <strong>None:</strong> you wrote it without AI help.
          </li>
          <li>
            <strong>Assisted:</strong> you used AI for things like checking spelling, finding a source or testing an idea, and the argument and the words
            are yours.
          </li>
          <li>
            <strong>Generated:</strong> AI wrote all or most of the words.
          </li>
        </ul>
        <p>
          Every Dispatch must carry an honest label. We show it publicly so readers can judge. No AI detector is reliable, so a person always reads before
          anyone acts on a flag.
        </p>

        <H2>How we use AI behind the scenes</H2>
        <p>
          <strong>Safety check.</strong> When you choose a handle or post a Dispatch, we send the text, with the Campaign&apos;s question and type, to our AI
          provider, Anthropic, to check it against our community rules. We never send your name, email address or profile. The AI can hold a Dispatch for a
          person to read. It never deletes anything and never decides alone. A person reviews every hold and every appeal.
        </p>
        <p>
          <strong>Tone check (optional).</strong> If you press &ldquo;Check my tone&rdquo;, your draft is sent to Anthropic for a private note about how it
          may read. We do not keep your draft, and only you see the result.
        </p>
        <p>
          <strong>Coach (optional).</strong> If you press &ldquo;Get feedback&rdquo;, your draft is sent to Anthropic. The coach asks questions and never
          writes your text. We do not keep your draft, and only you see the result. Read the full details in the{" "}
          <InlineLink href="/privacy#automated-checks">Privacy policy</InlineLink>.
        </p>
      </Prose>
    </Page>
  );
}
