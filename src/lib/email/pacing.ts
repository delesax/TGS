// Resend's free plan allows about 10 requests a second. The outbox sends one message at a time, so this keeps
// each Resend request at least 200 ms after the last one (about 5 a second) and retries a 429 once after the
// time Resend asks for. A retry reuses the same Idempotency-Key, so a message is never sent twice.

export const MIN_GAP_MS = 200;
export const MAX_RETRY_WAIT_MS = 5_000;

export type Pacer = { wait: () => Promise<void> };

export function createPacer(opts: { gapMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}): Pacer {
  const gap = opts.gapMs ?? MIN_GAP_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let next = 0;
  return {
    async wait() {
      // Reserve the slot first so concurrent callers queue behind each other.
      const t = now();
      const start = Math.max(t, next);
      next = start + gap;
      if (start > t) await sleep(start - t);
    },
  };
}

/** Seconds from a Retry-After header, or a default, never longer than MAX_RETRY_WAIT_MS. */
export function retryAfterMs(header: string | null): number {
  const seconds = header ? Number(header) : NaN;
  const ms = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000;
  return Math.min(Math.max(ms, MIN_GAP_MS), MAX_RETRY_WAIT_MS);
}

/** Runs one request through the pacer; on HTTP 429 waits and tries once more. Any other result is returned as it is. */
export async function pacedRequest(
  pacer: Pacer,
  doFetch: () => Promise<Response>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<Response> {
  await pacer.wait();
  const first = await doFetch();
  if (first.status !== 429) return first;
  await sleep(retryAfterMs(first.headers.get("retry-after")));
  await pacer.wait();
  return doFetch();
}
