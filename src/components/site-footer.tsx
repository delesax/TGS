import Image from "next/image";
import Link from "next/link";
import { Fact, FactEmail } from "@/components/legal-ui";
import { LEGAL } from "@/lib/legal";

const links = [
  { href: "/terms", label: "Terms of use" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/ai-use", label: "How we use AI" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/privacy/contact", label: "Contact us about your data" },
];

/**
 * Compact footer: the lockup and the policy links on one row, then one muted line of small print. The company line
 * is a UK legal requirement for company websites (Companies Act trading disclosures); its "[to be added]" values
 * stay exactly as the owner left them.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-hairline bg-muted/40">
      <div className="page-container flex flex-col gap-4 py-7">
        <div className="flex flex-col gap-x-8 gap-y-2 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="inline-flex self-start no-underline">
            <Image src="/brand/lockup-full.svg" alt="The Grand Strategist" width={171} height={28} unoptimized className="block h-[28px] w-auto" />
          </Link>
          <nav aria-label="Policies">
            <ul className="-mx-2 flex flex-wrap md:justify-end">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex items-center rounded-md px-2 py-1.5 text-[15px] text-muted-foreground no-underline transition-colors duration-200 hover:bg-background hover:text-foreground hover:underline focus-visible:underline motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <address data-testid="company-block" className="border-t border-hairline pt-3 text-[14px] leading-[1.5] not-italic text-muted-foreground [overflow-wrap:anywhere]">
          {LEGAL.companyName} · Invite-only pilot · Registered in {LEGAL.jurisdiction}, company number <Fact k="companyNumber" plain /> · Registered office:{" "}
          <Fact k="registeredOffice" plain /> · <FactEmail k="contactEmail" plain />
        </address>
      </div>
    </footer>
  );
}
