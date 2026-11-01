import Link from "next/link";
import { Award, Clock, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";

const ideas = [
  { icon: Clock, title: "On the clock", text: "Every Campaign has a fixed deadline. Make your case before time runs out." },
  { icon: Scale, title: "Judged on reasoning", text: "Logic, evidence and fair answers to others count. Volume and outrage do not." },
  { icon: Award, title: "One Grand Strategist", text: "Each Campaign names a single winner, with the reasons published." },
];

export default async function HomePage() {
  const viewer = await getViewer();
  const handle = viewer?.profile?.handle;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-8 sm:py-12">
      <section className="flex flex-col gap-4">
        {viewer ? (
          <>
            <h1 className="text-3xl font-bold sm:text-4xl">{handle ? `Welcome back, @${handle}` : "Welcome"}</h1>
            <p className="text-xl text-muted-foreground">
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
            <h1 className="text-3xl font-bold sm:text-5xl">The best argument wins. Before the deadline.</h1>
            <p className="text-xl text-muted-foreground">
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
      </section>

      <section aria-labelledby="how-it-works" className="flex flex-col gap-4">
        <h2 id="how-it-works" className="text-2xl font-semibold">
          How it works
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {ideas.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Card className="h-full">
                <CardHeader className="mb-0">
                  <Icon aria-hidden className="size-8 text-primary" />
                  <CardTitle className="text-xl">{title}</CardTitle>
                  <CardDescription className="text-lg">{text}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
