import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { DisplayDialog } from "@/components/display-dialog";
import { DisplayTrigger } from "@/components/display-trigger";
import { HeaderSearch } from "@/components/header-search";
import { MobileNav } from "@/components/mobile-nav";
import { NavLink } from "@/components/nav-link";

/**
 * Persistent header on every page (UX lesson: a signed-in user must always be
 * able to get back to Home, Campaigns, Dossier and their account).
 *
 * From the lg breakpoint (1024px) the header is one slim sticky row that shares the page's fluid container (.page-container
 * in globals.css): logo left, links centred, Text button and search right. An admin's seven links plus the logo fit from
 * 1024px at every text size, in every font and on Linux text rendering, which is about 3% wider than macOS (the link padding, 4px at lg and
 * 7px at xl, and the 8px gap between the three groups are what keep the right-hand group inside the container); below 1024px
 * the links move into the Menu panel. The logo height and the row height come from
 * --header-logo-h and --header-h (globals.css).
 */
export async function SiteHeader() {
  const viewer = await getViewer();

  return (
    <header className="relative z-40 border-b border-hairline bg-background/85 backdrop-blur-md lg:sticky lg:top-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="page-container flex flex-wrap items-center justify-between gap-x-2 gap-y-0 py-[3px] lg:h-[var(--header-h)] lg:flex-nowrap lg:gap-2 lg:py-0">
        <Link href="/" className="flex min-h-[46px] max-w-full min-w-0 shrink items-center no-underline lg:min-h-10 lg:shrink-0 lg:whitespace-nowrap">
          {/* The same two-tier lockup at every width: 46px tall (about 282px wide) below lg, so it fits a 320px screen. */}
          <Image src="/brand/lockup-full.svg" alt="The Grand Strategist" width={295} height={48} priority unoptimized className="block h-[46px] w-auto max-w-full object-contain object-left lg:h-[var(--header-logo-h)]" />
        </Link>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-x-0.5">
            <li>
              <NavLink href="/" className="lg:min-h-[42px] lg:px-[4px] lg:text-[15px] lg:whitespace-nowrap xl:px-[7px] xl:text-[16px]">Home</NavLink>
            </li>
            <li>
              <NavLink href="/campaigns" className="lg:min-h-[42px] lg:px-[4px] lg:text-[15px] lg:whitespace-nowrap xl:px-[7px] xl:text-[16px]">Campaigns</NavLink>
            </li>
            <li>
              <NavLink href="/leaderboard" className="lg:min-h-[42px] lg:px-[4px] lg:text-[15px] lg:whitespace-nowrap xl:px-[7px] xl:text-[16px]">Leaderboard</NavLink>
            </li>
            <li>
              <NavLink href="/dossier" className="lg:min-h-[42px] lg:px-[4px] lg:text-[15px] lg:whitespace-nowrap xl:px-[7px] xl:text-[16px]">Dossier</NavLink>
            </li>
            {viewer ? (
              <>
                {viewer.isAdmin ? (
                  <li>
                    <NavLink href="/admin" className="lg:min-h-[42px] lg:px-[4px] lg:text-[15px] lg:whitespace-nowrap xl:px-[7px] xl:text-[16px]">Admin</NavLink>
                  </li>
                ) : null}
                <li>
                  <NavLink href="/profile" className="lg:min-h-[42px] lg:px-[4px] lg:text-[15px] lg:whitespace-nowrap xl:px-[7px] xl:text-[16px]">Account</NavLink>
                </li>
                <li>
                  <form action={signOut} className="flex">
                    <button
                      type="submit"
                      className="h-[42px] whitespace-nowrap rounded-md px-[4px] text-[15px] xl:px-[7px] xl:text-[16px] font-semibold text-foreground underline underline-offset-4 hover:bg-muted"
                    >
                      Sign out
                    </button>
                  </form>
                </li>
              </>
            ) : (
              <li>
                <NavLink href="/login" className="lg:min-h-[42px] lg:px-[4px] lg:text-[15px] lg:whitespace-nowrap xl:px-[7px] xl:text-[16px]">Sign in</NavLink>
              </li>
            )}
          </ul>
        </nav>
        <div className="hidden items-center gap-1 lg:flex">
          <DisplayTrigger variant="header" />
          <Link
            href="/search"
            aria-label="Search"
            title="Search"
            className="grid size-[40px] place-items-center rounded-[10px] text-foreground transition-colors duration-200 hover:bg-muted motion-reduce:transition-none xl:hidden"
          >
            <Search aria-hidden className="size-5" />
          </Link>
          <HeaderSearch />
        </div>
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
                <li>
                  <DisplayTrigger variant="menu" />
                </li>
              </ul>
            </nav>
          </MobileNav>
        </div>
      </div>
      <div className="page-container pb-[4px] lg:hidden">
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
            placeholder="Search"
            className="field min-h-[44px] min-w-0 py-[6px] text-[16px] leading-6"
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
      <DisplayDialog />
    </header>
  );
}
