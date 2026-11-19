import Link from "next/link";
import { Award, Clock, Scale } from "lucide-react";
import { ApexMark, ApexMotif } from "@/components/apex-motif";
import { CampaignBadges } from "@/components/campaign-badges";
import { Countdown } from "@/components/countdown";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { getOwnerDecisionIds, getServerNow, listCampaigns } from "@/lib/campaign-data";
import { formatUkDateTime, pickNextCampaign, statusAt } from "@/lib/campaigns";

const steps = [
  { icon: Clock, title: "On the clock", text: "Every Campaign has a fixed deadline. Make your case before time runs out." },
  { icon: Scale, title: "Judged on reasoning", text: "Logic, evidence and fair answers to others count. Volume and outrage do not." },
  { icon: Award, title: "One Grand Strategist", text: "Each Campaign names a single winner, with the reasons published." },
];

export default async function HomePage() {
  const [viewer, campaigns, now] = await Promise.all([getViewer(), listCampaigns(), getServerNow()]);
  const handle = viewer?.profile?.handle;
  // Rule: open or scheduled only (never a draft), not sensitive, no owner-decision flag; the open one closing soonest, else the
  // scheduled one opening soonest. If the flag cannot be checked, show the quiet illustration instead (fail closed).
  const candidates = campaigns.filter((c) => !c.is_sensitive && (c.status === "open" || c.status === "scheduled"));
  const blocked = await getOwnerDecisionIds(candidates.map((c) => c.id));
  const next = blocked ? pickNextCampaign(candidates, now, blocked) : null;
  const nextStatus = next ? statusAt(next, now) : null;

  return (
    <div className="page-container py-8 sm:py-12">
      <section className="hero-glow relative grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
        <ApexMotif className="pointer-events-none absolute right-0 top-0 -z-10 hidden w-[30rem] max-w-full sm:block" />
        <div className="fade-up flex min-w-0 flex-col items-start gap-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-eyebrow">Invite-only pilot</p>
          {viewer ? (
            <>
              <h1 className="text-3xl font-medium leading-[1.1] tracking-[-0.025em] [overflow-wrap:anywhere] sm:text-5xl">{handle ? `Welcome back, @${handle}` : "Welcome"}</h1>
              <p className="max-w-[34rem] text-lg text-muted-foreground">
                {handle ? "Where would you like to go?" : "One more step: choose the handle other Strategists will see."}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                {handle ? (
                  <>
                    <Button asChild size="lg">
                      <Link href="/dossier">Open my Dossier</Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <Link href="/campaigns">See Campaigns</Link>
                    </Button>
                  </>
                ) : (
                  <Button asChild size="lg">
                    <Link href="/onboarding">Choose my handle</Link>
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <h1 className="text-[2rem] font-medium leading-[1.08] tracking-[-0.025em] sm:text-5xl lg:text-[3rem] xl:text-[3.3rem]">
                <span className="block">The best argument wins.</span>
                <span className="block">Before the deadline.</span>
              </h1>
              <p className="max-w-[34rem] text-lg text-muted-foreground">
                The Grand Strategist is an arena for careful reasoning on questions that matter. It is invite-only during the pilot.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/signup">I have an invite code</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </>
          )}
        </div>

        <aside aria-label="Next Campaign" className="fade-up [animation-delay:80ms]">
          {next && nextStatus ? (
            <div className="featured-edge rounded-[12px] p-5 shadow-[var(--shadow-raised)] sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{nextStatus === "open" ? "Open now" : "Next Campaign"}</p>
              <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">
                <Link href={`/campaigns/${next.slug}`} className="no-underline underline-offset-4 hover:underline focus-visible:underline">
                  {next.title}
                </Link>
              </h2>
              <div className="mt-3">
                <CampaignBadges status={nextStatus} category={next.category} format={next.format} />
              </div>
              <p className="mt-3 text-base text-muted-foreground">
                {nextStatus === "open" ? `Closes ${formatUkDateTime(next.ends_at)}` : `Opens ${formatUkDateTime(next.starts_at)}`}
              </p>
              <div className="mt-4">
                <Countdown
                  id="home-countdown"
                  target={nextStatus === "open" ? next.ends_at : next.starts_at}
                  serverNow={now}
                  label={nextStatus === "open" ? "Time left" : "Opens in"}
                  doneLabel={nextStatus === "open" ? "Closed" : "Open now"}
                  size="small"
                />
              </div>
              <Button asChild variant="outline" className="mt-5">
                <Link href={`/campaigns/${next.slug}`}>View Campaign</Link>
              </Button>
            </div>
          ) : (
            <div className="surface-card flex flex-col items-center gap-3 px-6 py-10 text-center">
              <ApexMark className="w-20 text-primary/80" />
              <p className="max-w-[26ch] text-base text-muted-foreground">Campaigns appear here as soon as they are scheduled.</p>
            </div>
          )}
        </aside>
      </section>

      <section aria-labelledby="how-it-works" className="mt-14 sm:mt-20">
        <h2 id="how-it-works" className="text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="mt-5 grid gap-0 sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex flex-col gap-2 border-t border-hairline py-5 sm:border-l sm:border-t-0 sm:px-6 sm:first:border-l-0 sm:first:pl-0">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-secondary text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span aria-hidden className="text-sm font-semibold tabular-nums tracking-[0.14em] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
              <p className="max-w-[34ch] text-base text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
