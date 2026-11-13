import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountDeletedContent, DeletionOffContent, DeletionOnContent } from "@/app/profile/delete/delete-content";
import AccessibilityPage from "@/app/accessibility/page";
import AiUsePage from "@/app/ai-use/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { SiteFooter } from "@/components/site-footer";
import { DraftNotice } from "@/components/page";
import { LEGAL, PLACEHOLDER_TEXT, companyBlockLines, emptyLegalKeys, legalValue, registrationLine } from "@/lib/legal";

const pages: Record<string, () => string> = {
  privacy: () => renderToStaticMarkup(createElement(PrivacyPage)),
  terms: () => renderToStaticMarkup(createElement(TermsPage)),
  "ai-use": () => renderToStaticMarkup(createElement(AiUsePage)),
  accessibility: () => renderToStaticMarkup(createElement(AccessibilityPage)),
  footer: () => renderToStaticMarkup(createElement(SiteFooter)),
  "delete (off)": () => renderToStaticMarkup(createElement(DeletionOffContent)),
  "delete (on)": () => renderToStaticMarkup(createElement(DeletionOnContent, { handle: "tester", count: 2, confirm: null })),
  "account deleted": () => renderToStaticMarkup(createElement(AccountDeletedContent, { n: 2 })),
};

function gateProblems(html: string): string[] {
  const problems: string[] = [];
  if (html.includes("[to be added]")) problems.push("shows [to be added]");
  if (html.includes("[DRAFT")) problems.push("shows [DRAFT");
  if (html.includes("data-pending")) problems.push("has a fact still pending");
  if (html.includes("final legal review")) problems.push("still shows the draft banner");
  return problems;
}

const BANNER = "DRAFT: this page is complete but has not yet had its final legal review. Some details are still to be added.";

describe("LEGAL facts and the draft gate", () => {
  it("gives the company name, jurisdiction and versions the brief fixes", () => {
    expect(LEGAL.companyName).toBe("The Grand Strategist Limited");
    expect(LEGAL.jurisdiction).toBe("England and Wales");
    expect(LEGAL.termsVersion).toBe("2026-11-a");
    expect(LEGAL.privacyVersion).toBe("2026-11-a");
  });

  it("legalValue() shows a visible placeholder for an empty value", () => {
    expect(PLACEHOLDER_TEXT).toBe("[to be added]");
    for (const key of emptyLegalKeys()) expect(legalValue(key)).toBe("[to be added]");
    expect(legalValue("companyName")).toBe("The Grand Strategist Limited");
  });

  it("builds the registration line and company block from LEGAL", () => {
    expect(registrationLine()).toMatch(/^Registered in England and Wales, company number /);
    expect(companyBlockLines()).toHaveLength(3);
  });

  it("while reviewed is false, shows the draft banner with the exact wording on every legal page", () => {
    expect(LEGAL.reviewed).toBe(false);
    expect(renderToStaticMarkup(createElement(DraftNotice))).toContain(BANNER);
    for (const name of ["privacy", "terms", "ai-use", "accessibility"]) {
      expect(pages[name](), name).toContain(BANNER);
    }
  });

  it("no page ever shows a [DRAFT heading any more", () => {
    for (const [name, render] of Object.entries(pages)) expect(render(), name).not.toContain("[DRAFT");
  });

  // THE GATE. This is the test that stops the owner flipping `reviewed` to true
  // while anything is still missing. It passes today because reviewed is false.
  it("if reviewed is true: every LEGAL value is filled in and no page shows a placeholder", () => {
    if (!LEGAL.reviewed) return;
    expect(emptyLegalKeys(), "LEGAL values still empty").toEqual([]);
    for (const [name, render] of Object.entries(pages)) expect(gateProblems(render()), name).toEqual([]);
  });

  it("the gate's page check catches each kind of leftover placeholder", () => {
    expect(gateProblems("<p>fine</p>")).toEqual([]);
    expect(gateProblems("<p>[to be added]</p>")).toHaveLength(1);
    expect(gateProblems("<h2>[DRAFT] Who we are</h2>")).toHaveLength(1);
    expect(gateProblems('<span data-pending="owner">[six years]</span>')).toHaveLength(1);
    expect(gateProblems(`<p>${BANNER}</p>`)).toHaveLength(1);
  });
});
