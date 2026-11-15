import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { MobileNav } from "@/components/mobile-nav";
import { NavLink } from "@/components/nav-link";

/**
 * Persistent header on every page (UX lesson: a signed-in user must always be
 * able to get back to Home, Campaigns, Dossier and their account).
 *
 * From the lg breakpoint (1024px) the header is wider than the 4xl page
 * content, because an admin's seven links plus the logo need about 950px and
 * "Sign out" used to wrap onto a second row and push the search box down.
 * Below lg nothing changes.
 */
export async function SiteHeader() {
  const viewer = await getViewer();

  return (
    <header className="relative border-b border-border bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-2 gap-y-0 px-[12px] py-[3px] lg:max-w-6xl lg:flex-nowrap lg:gap-2 lg:px-4 lg:py-3">
        <Link href="/" className="flex min-h-[46px] max-w-full min-w-0 shrink items-center no-underline lg:min-h-12 lg:shrink-0 lg:whitespace-nowrap">
          {/* The same two-tier lockup at every width: 46px tall (about 282px wide) below lg, so it fits a 320px screen. */}
          <Image src="/brand/lockup-full.svg" alt="The Grand Strategist" width={295} height={48} priority unoptimized className="block h-[46px] w-auto max-w-full object-contain object-left lg:h-[34px] xl:h-[54px]" />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="-mx-2 flex flex-wrap items-center gap-x-1 gap-y-1">
            <li>
              <NavLink href="/">Home</NavLink>
            </li>
            <li>
              <NavLink href="/campaigns">Campaigns</NavLink>
            </li>
            <li>
              <NavLink href="/leaderboard">Leaderboard</NavLink>
            </li>
            <li>
              <NavLink href="/dossier">Dossier</NavLink>
            </li>
            {viewer ? (
              <>
                {viewer.isAdmin ? (
                  <li>
                    <NavLink href="/admin">Admin</NavLink>
                  </li>
                ) : null}
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
        <div className="ml-auto flex shrink-0 items-center gap-1 lg:hidden">
          {viewer ? null : (
            <NavLink href="/login" className="min-h-[44px] shrink-0 px-[8px] text-[18px] lg:hidden">
              Sign in
            </NavLink>
          )}
          <MobileNav>
            <nav aria-label="Main">
              <ul className="flex flex-col gap-1 p-2">
                <li>
                  <NavLink href="/">Home</NavLink>
                </li>
                <li>
                  <NavLink href="/campaigns">Campaigns</NavLink>
                </li>
                <li>
                  <NavLink href="/leaderboard">Leaderboard</NavLink>
                </li>
                <li>
                  <NavLink href="/dossier">Dossier</NavLink>
                </li>
                {viewer ? (
                  <>
                    {viewer.isAdmin ? (
                      <li>
                        <NavLink href="/admin">Admin</NavLink>
                      </li>
                    ) : null}
                    <li>
                      <NavLink href="/profile">Account</NavLink>
                    </li>
                    <li>
                      <form action={signOut}>
                        <button
                          type="submit"
                          className="flex min-h-12 w-full items-center rounded-md px-3 text-lg font-semibold text-foreground underline underline-offset-4 hover:bg-muted"
                        >
                          Sign out
                        </button>
                      </form>
                    </li>
                  </>
                ) : null}
              </ul>
            </nav>
          </MobileNav>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-[12px] pb-[4px] lg:max-w-6xl lg:px-4 lg:pb-3">
        <form role="search" action="/search" className="flex gap-2 lg:max-w-4xl">
          <label htmlFor="site-search" className="sr-only">
            Search Campaigns, Dispatches and Strategists
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            enterKeyHint="search"
            maxLength={200}
            placeholder="Search"
            className="min-h-[44px] w-full min-w-0 rounded-md border-2 border-input lg:min-h-12 bg-background px-3 text-lg placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 lg:min-h-12 lg:min-w-12 items-center justify-center gap-2 rounded-md bg-primary px-3 text-lg font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Search aria-hidden className="size-5" />
            <span className="sr-only sm:not-sr-only">Search</span>
          </button>
        </form>
      </div>
    </header>
  );
}
