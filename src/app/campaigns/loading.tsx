export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-12">
      <div className="h-10 w-1/2 animate-pulse rounded-md bg-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 w-full animate-pulse rounded-xl bg-muted" />
      ))}
      <span className="text-lg text-muted-foreground">Loading Campaigns…</span>
    </div>
  );
}
