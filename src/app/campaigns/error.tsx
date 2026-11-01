"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CampaignsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold">Campaigns did not load</h1>
      <p className="text-xl text-muted-foreground">
        We could not reach the Campaign list just now. Your positions and account are safe. Please try again in a moment.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
