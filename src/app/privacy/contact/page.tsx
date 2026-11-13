import type { Metadata } from "next";
import { FactEmail, InlineLink } from "@/components/legal-ui";
import { Page } from "@/components/page";
import { getViewer } from "@/lib/auth";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact us about your data" };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const viewer = await getViewer();
  return (
    <Page
      title="Contact us about your data"
      narrow
      intro={
        <>
          Use this form to ask a question, see or correct your data, ask us to delete it, withdraw a consent or make a complaint. You can also email{" "}
          <FactEmail k="privacyEmail" />. We will reply within one month. Read the <InlineLink href="/privacy">Privacy policy</InlineLink> first if you
          like.
        </>
      }
    >
      <ContactForm signedInEmail={viewer?.email ?? null} />
    </Page>
  );
}
