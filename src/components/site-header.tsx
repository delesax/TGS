import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { NavLink } from "@/components/nav-link";

/**
 * Persistent header on every page (UX lesson: a signed-in user must always be
 * able to get back to Home, Campaigns, Dossier and their account).
 */
export async function SiteHeader() {
  const viewer = await getViewer();

  return (
    <header className="border-b border-border bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex min-h-12 items-center font-serif text-xl font-bold text-primary no-underline">
          The Grand Strategist
        </Link>
        <nav aria-label="Main">
          <ul className="-mx-2 flex flex-wrap items-center gap-x-1 gap-y-1">
            <li>
              <NavLink href="/">Home</NavLink>
            </li>
            <li>
              <NavLink href="/campaigns">Campaigns</NavLink>
            </li>
            <li>
              <NavLink href="/dossier">Dossier</NavLink>
            </li>
            {viewer ? (
              <>
                <li>
                  <NavLink href="/profile">Account</NavLink>
                </li>
                <li>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="min-h-12 rounded-md px-3 text-lg font-semibold text-foreground underline underline-offset-4 hover:bg-muted"
                    >
                      Sign out
                    </button>
                  </form>
                </li>
              </>
            ) : (
              <li>
                <NavLink href="/login">Sign in</NavLink>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
