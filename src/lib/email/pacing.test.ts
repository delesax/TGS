import { describe, expect, it } from "vitest";
import { createPacer, pacedRequest, retryAfterMs } from "./pacing";

describe("Resend pacing", () => {
  it("spaces requests at least 200 ms apart (about 5 a second), even when they arrive together", async () => {
    let t = 0;
    const slept: number[] = [];
    const pacer = createPacer({ now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
    for (let i = 0; i < 4; i++) await pacer.wait();
    expect(slept).toEqual([200, 200, 200]);
  });

  it("does not delay a request that comes after the gap", async () => {
    let t = 0;
    const slept: number[] = [];
    const pacer = createPacer({ now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
    await pacer.wait();
    t += 500;
    await pacer.wait();
    expect(slept).toEqual([]);
  });

  it("reads Retry-After in seconds, with a floor and a cap", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("999")).toBe(5000);
    expect(retryAfterMs(null)).toBe(1000);
    expect(retryAfterMs("soon")).toBe(1000);
  });

  it("retries a 429 once, then returns whatever comes back", async () => {
    const pacer = { wait: async () => {} };
    let calls = 0;
    const waits: number[] = [];
    const res = await pacedRequest(pacer, async () => (++calls === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "1" } }) : new Response("{}", { status: 200 })), async (ms) => { waits.push(ms); });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
    expect(waits).toEqual([1000]);
    calls = 0;
    const again = await pacedRequest(pacer, async () => { calls++; return new Response("{}", { status: 429 }); }, async () => {});
    expect(again.status).toBe(429); // a second 429 is returned, so the outbox's own back-off takes over
    expect(calls).toBe(2);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    const res = await pacedRequest({ wait: async () => {} }, async () => { calls++; return new Response("{}", { status: 500 }); }, async () => {});
    expect(res.status).toBe(500);
    expect(calls).toBe(1);
  });
});
