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
 * One slim row from 1280px: the small print on the left (it wraps to two lines), the five policy links inline on the right.
 * Below 1280px the line and the links are two compact rows; on phones they stack, with 44px link targets. The header carries
 * the lockup, so the footer has none. The company line is a UK legal requirement for company websites (Companies Act trading
 * disclosures: name, place of registration, number, registered office); its "[to be added]" values stay exactly as the owner
 * left them.
 */
export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-hairline bg-muted/40">
      <div className="page-container flex flex-col gap-x-8 gap-y-0 py-2 min-[1280px]:flex-row min-[1280px]:items-center min-[1280px]:justify-between">
        <address data-testid="company-block" className="min-w-0 text-[0.8rem] leading-[1.45] not-italic text-muted-foreground [overflow-wrap:anywhere] min-[1280px]:max-w-[44rem]">
          {LEGAL.companyName} · Invite-only pilot · Registered in {LEGAL.jurisdiction}, company number <Fact k="companyNumber" plain /> · Registered office:{" "}
          <Fact k="registeredOffice" plain /> · <FactEmail k="contactEmail" plain />
        </address>
        <nav aria-label="Policies" className="shrink-0">
          <ul className="-mx-2 flex flex-wrap min-[1280px]:justify-end">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center rounded-md px-2 py-1 text-[0.85rem] text-muted-foreground no-underline transition-colors duration-200 hover:bg-background hover:text-foreground hover:underline focus-visible:underline motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
