"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex min-h-12 items-center rounded-md px-3 text-lg font-semibold text-foreground hover:bg-muted",
        current ? "bg-secondary text-secondary-foreground underline decoration-2 underline-offset-8" : "no-underline",
      )}
    >
      {children}
    </Link>
  );
}
