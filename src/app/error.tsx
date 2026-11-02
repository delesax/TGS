"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="text-xl text-muted-foreground">
        This page did not load properly. Nothing you saved has been lost. Please try again, or go back to the home page.
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
