import type { Metadata } from "next";
import { DraftNotice, Page } from "@/components/page";
import { AccountDeletedContent } from "@/app/profile/delete/delete-content";

export const metadata: Metadata = { title: "Account deleted" };

export default async function AccountDeletedPage({ searchParams }: PageProps<"/account-deleted">) {
  const { kept } = await searchParams;
  const n = Math.max(0, Number(kept) || 0);
  return (
    <Page title="Your account has been deleted" narrow>
      <DraftNotice />
      <AccountDeletedContent n={n} />
    </Page>
  );
}
