export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 sm:py-12">
      <div className="h-9 w-1/2 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="h-5 w-2/3 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 w-full animate-pulse rounded-[12px] border border-hairline bg-card motion-reduce:animate-none" />
      ))}
      <span className="sr-only">Loading Campaigns…</span>
    </div>
  );
}
