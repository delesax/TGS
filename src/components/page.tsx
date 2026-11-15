import { LEGAL } from "@/lib/legal";
import { cn } from "@/lib/utils";

/** Standard page wrapper: one h1, an optional plain-English intro, then content. */
export function Page({
  title,
  intro,
  narrow = false,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  narrow?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("page-container py-8 sm:py-12", narrow && "max-w-xl")}>
      <h1>{title}</h1>
      {intro ? <div className="mt-3 max-w-[65ch] text-lg text-muted-foreground">{intro}</div> : null}
      <div className="mt-8 flex flex-col gap-6">{children}</div>
    </div>
  );
}

/** Shown when a list has nothing in it yet: say why, and what to do next. */
export function EmptyState({ title, children, action, as: Heading = "h3" }: { title: string; children: React.ReactNode; action?: React.ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[12px] bg-muted/70 px-5 py-4">
      <Heading className="text-lg">{title}</Heading>
      <div className="max-w-[65ch] text-base text-muted-foreground">{children}</div>
      {action}
    </div>
  );
}

/**
 * Banner for legal pages while LEGAL.reviewed is false (src/lib/legal.ts).
 * Renders nothing once the owner has flipped the flag after the final review.
 */
export function DraftNotice() {
  if (LEGAL.reviewed) return null;
  return (
    <div role="note" className="rounded-lg border border-accent-foreground/50 bg-accent p-4 text-lg text-accent-foreground">
      <p className="font-bold">DRAFT: this page is complete but has not yet had its final legal review. Some details are still to be added.</p>
    </div>
  );
}
