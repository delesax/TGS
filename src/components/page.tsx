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
    <div className={cn("mx-auto w-full px-4 py-8 sm:py-12", narrow ? "max-w-xl" : "max-w-4xl")}>
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {intro ? <div className="mt-3 text-xl text-muted-foreground">{intro}</div> : null}
      <div className="mt-8 flex flex-col gap-6">{children}</div>
    </div>
  );
}

/** Shown when a list has nothing in it yet: say why, and what to do next. */
export function EmptyState({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-border bg-muted p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="text-lg text-muted-foreground">{children}</div>
      {action}
    </div>
  );
}

/** Banner for draft legal and policy text. */
export function DraftNotice() {
  return (
    <div role="note" className="rounded-lg border-2 border-accent-foreground bg-accent p-4 text-lg text-accent-foreground">
      <p className="font-bold">DRAFT — placeholder text, not yet reviewed.</p>
      <p>This page will be replaced with reviewed wording before the pilot opens. Do not rely on it.</p>
    </div>
  );
}
