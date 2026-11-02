import Link from "next/link";
import { Search } from "lucide-react";
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
      <div className="mx-auto max-w-4xl px-4 pb-3">
        <form role="search" action="/search" className="flex gap-2">
          <label htmlFor="site-search" className="sr-only">
            Search Campaigns, Dispatches and Strategists
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            enterKeyHint="search"
            maxLength={200}
            placeholder="Search Campaigns, Dispatches, people"
            className="min-h-12 w-full min-w-0 rounded-md border-2 border-input bg-background px-3 text-lg placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <button
            type="submit"
            className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-3 text-lg font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Search aria-hidden className="size-5" />
            <span className="sr-only sm:not-sr-only">Search</span>
          </button>
        </form>
      </div>
    </header>
  );
}
