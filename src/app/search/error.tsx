"use client";

import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";

export default function SearchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Page title="Search">
      <div role="alert" className="flex flex-col gap-3 rounded-xl border-2 border-destructive p-5">
        <p className="text-xl font-semibold">Search is not working right now.</p>
        <p className="text-lg">Please try again in a moment.</p>
        <Button type="button" variant="outline" className="self-start" onClick={reset}>
          Try again
        </Button>
      </div>
    </Page>
  );
}
