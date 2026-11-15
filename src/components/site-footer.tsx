import Image from "next/image";
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
    <footer className="mt-16 border-t border-hairline bg-muted/40">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
        <Link href="/" className="inline-flex self-start no-underline">
          <Image src="/brand/lockup-full.svg" alt="The Grand Strategist" width={209} height={34} unoptimized className="block h-[34px] w-auto" />
        </Link>
        <nav aria-label="Policies">
          <ul className="-mx-2 flex flex-wrap gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="flex min-h-11 items-center rounded-md px-2 text-[15px] text-muted-foreground no-underline transition-colors duration-200 hover:bg-background hover:text-foreground hover:underline focus-visible:underline motion-reduce:transition-none">
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
