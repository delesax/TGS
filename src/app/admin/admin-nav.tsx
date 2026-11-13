import Link from "next/link";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/admin", label: "Console" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/privacy-requests", label: "Privacy requests" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/judging", label: "Judging" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

/** The admin console's own navigation. Wraps on small screens. */
export function AdminNav({ current }: { current: (typeof SECTIONS)[number]["href"] }) {
  return (
    <nav aria-label="Admin console">
      <ul className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              aria-current={s.href === current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-12 items-center rounded-md border-2 px-3 text-lg font-semibold",
                s.href === current ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
