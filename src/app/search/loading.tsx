import { Page } from "@/components/page";

export default function Loading() {
  return (
    <Page title="Search">
      <p role="status" className="text-lg">
        Searching…
      </p>
    </Page>
  );
}
