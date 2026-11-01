export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-12">
      <div className="h-10 w-2/3 animate-pulse rounded-md bg-muted" />
      <div className="h-6 w-full animate-pulse rounded-md bg-muted" />
      <div className="h-6 w-5/6 animate-pulse rounded-md bg-muted" />
      <span className="text-lg text-muted-foreground">Loading…</span>
    </div>
  );
}
