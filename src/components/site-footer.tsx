import Link from "next/link";

const links = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/ai-use", label: "How we use AI" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-muted">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base text-muted-foreground">The Grand Strategist · Invite-only pilot</p>
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
      </div>
    </footer>
  );
}
