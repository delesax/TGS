import type { Metadata } from "next";
import Link from "next/link";
import { DraftNotice, Page } from "@/components/page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account deleted" };

// OWNER DECISION 8: DRAFT wording awaiting approval.
export default async function AccountDeletedPage({ searchParams }: PageProps<"/account-deleted">) {
  const { kept } = await searchParams;
  const n = Math.max(0, Number(kept) || 0);
  return (
    <Page title="Your account has been deleted" narrow>
      <DraftNotice />
      <p className="text-lg">
        Your email address, sign-in, handle and profile have been removed.
        {n ? ` Your ${n} Dispatch${n === 1 ? " stays" : "es stay"} in the debates, shown as by “a deleted Strategist”.` : ""}
      </p>
      <Button asChild className="self-start">
        <Link href="/">Go to the home page</Link>
      </Button>
    </Page>
  );
}
