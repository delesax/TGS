import Link from "next/link";
import { Fact, FactEmail } from "@/components/legal-ui";
import { PwaSupport } from "@/components/pwa";
import { LEGAL } from "@/lib/legal";

const links = [
  { href: "/terms", label: "Terms of use" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/ai-use", label: "How we use AI" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/privacy/contact", label: "Contact us about your data" },
];

/** The company block is a UK legal requirement for company websites (Companies Act trading disclosures). */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-muted">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        <nav aria-label="Policies">
          <ul className="-mx-2 flex flex-wrap gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="flex min-h-12 items-center rounded-md px-2 text-base text-foreground underline hover:bg-background">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <address data-testid="company-block" className="flex flex-col gap-1 text-base not-italic text-muted-foreground">
          <p className="font-semibold text-foreground">{LEGAL.companyName} · Invite-only pilot</p>
          <p>
            Registered in {LEGAL.jurisdiction}, company number <Fact k="companyNumber" />
          </p>
          <p>
            Registered office: <Fact k="registeredOffice" />
          </p>
          <p>
            Contact: <FactEmail k="contactEmail" />
          </p>
        </address>
        <PwaSupport />
      </div>
    </footer>
  );
}
