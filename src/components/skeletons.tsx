import { cn } from "@/lib/utils";

/**
 * Loading skeletons: shapes that match the real page (same container, similar heights) so nothing jumps when the
 * content arrives. The shimmer is static under prefers-reduced-motion (see .skeleton in globals.css). Each one is a
 * single polite status region with a screen-reader label.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:py-12">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function Title({ wide = "w-1/2" }: { wide?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className={cn("h-9", wide)} />
      <Skeleton className="h-5 w-2/3 max-w-[65ch]" />
    </div>
  );
}

function CardRow({ lines = 2 }: { lines?: number }) {
  return (
    <div className="surface-card flex flex-col gap-3 p-5">
      <Skeleton className="h-6 w-2/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-1/2" : "w-5/6")} />
      ))}
    </div>
  );
}

export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <Shell label={label}>
      <Title />
      {Array.from({ length: rows }).map((_, i) => (
        <CardRow key={i} />
      ))}
    </Shell>
  );
}

export function LeaderboardSkeleton() {
  return (
    <Shell label="Loading the Leaderboard…">
      <Title wide="w-1/3" />
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-24 rounded-full" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="surface-card flex items-center justify-between gap-4 p-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-5 w-1/3" />
        </div>
      ))}
    </Shell>
  );
}

export function DossierSkeleton() {
  return (
    <Shell label="Loading your Dossier…">
      <Title wide="w-1/3" />
      <div className="surface-card flex flex-col gap-3 p-6">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-7 w-1/4" />
      {[0, 1].map((i) => (
        <CardRow key={i} lines={3} />
      ))}
    </Shell>
  );
}

/** Dispatch list: author line, a few lines of text and the tag row, as in a real Dispatch card. */
export function DispatchListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="surface-card flex flex-col gap-3 p-5">
          <Skeleton className="h-5 w-1/4" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full max-w-[65ch]" />
          <Skeleton className="h-4 w-11/12 max-w-[65ch]" />
          <Skeleton className="h-4 w-2/3 max-w-[65ch]" />
        </div>
      ))}
    </div>
  );
}

export function CampaignSkeleton() {
  return (
    <Shell label="Loading the Campaign…">
      <Title wide="w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="surface-card flex flex-col gap-3 p-5">
        <Skeleton className="h-5 w-24" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-16" />
          ))}
        </div>
      </div>
      <Skeleton className="h-7 w-1/4" />
      <DispatchListSkeleton />
    </Shell>
  );
}

export function VerdictSkeleton() {
  return (
    <Shell label="Loading the Verdict…">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-3/4 max-w-[28ch]" />
        <Skeleton className="h-5 w-1/2" />
      </div>
      <div className="surface-raised flex flex-col gap-4 p-7 sm:p-9">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="h-7 w-16" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-full max-w-[65ch]" />
        <Skeleton className="h-4 w-11/12 max-w-[65ch]" />
        <Skeleton className="h-4 w-5/6 max-w-[65ch]" />
      </div>
    </Shell>
  );
}
