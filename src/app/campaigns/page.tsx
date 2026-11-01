import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Campaigns" };

export default function CampaignsPage() {
  return (
    <Page title="Campaigns" intro="Each Campaign is a question with a deadline. The best argument before the clock runs out wins.">
      <EmptyState
        title="No Campaigns are open yet"
        action={
          <Button asChild variant="secondary">
            <Link href="/">Back to home</Link>
          </Button>
        }
      >
        The first Campaigns open soon. We will email you when they do.
      </EmptyState>
    </Page>
  );
}
