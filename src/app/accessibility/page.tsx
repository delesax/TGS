import type { Metadata } from "next";
import { FactEmail, H2, Prose } from "@/components/legal-ui";
import { DraftNotice, Page } from "@/components/page";

export const metadata: Metadata = { title: "Accessibility" };

export default function AccessibilityPage() {
  return (
    <Page title="Accessibility" intro="How we aim to make The Grand Strategist usable by everyone.">
      <DraftNotice />
      <Prose>
        <H2>Our aim</H2>
        <p>
          We aim for The Grand Strategist to meet WCAG 2.2 level AA, and to work with a keyboard, a screen reader, large type and high contrast.
        </p>
        <H2>How we test</H2>
        <p>
          We test with automated browser tests (Playwright) that run the main journeys on a phone-sized screen, 375 pixels wide, and check that no page
          scrolls sideways. We do not yet run an automated accessibility scanner, and we have not yet had a screen-reader audit on
          every release.
        </p>
        <H2>Known problems</H2>
        <p>None recorded yet. That does not mean there are none: please tell us if you find one.</p>
        <H2>Tell us if something does not work</H2>
        <p>
          If something does not work for you, tell us at <FactEmail k="contactEmail" /> and we will try to fix it or give you another way to take part.
        </p>
      </Prose>
    </Page>
  );
}
