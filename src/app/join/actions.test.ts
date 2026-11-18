import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The action is called directly here, not through the page: a server action can be invoked without the form.
const rpc = vi.fn();
const withinLimit = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/rate-limit", () => ({ withinLimit: (...a: unknown[]) => withinLimit(...a), ipSubject: async () => "ip", hashSubject: () => "h" }));

import { requestToJoin } from "./actions";

const form = (email: string) => {
  const f = new FormData();
  f.set("email", email);
  f.set("note", "");
  return f;
};

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
  withinLimit.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("requestToJoin and the JOIN_FORM_ENABLED switch", () => {
  for (const value of [undefined, "", "false", "TRUE", "1", "yes", " true"]) {
    it(`refuses before touching the database or the rate limits when the switch is ${JSON.stringify(value)}`, async () => {
      if (value === undefined) vi.stubEnv("JOIN_FORM_ENABLED", undefined as unknown as string);
      else vi.stubEnv("JOIN_FORM_ENABLED", value);
      const state = await requestToJoin({}, form("someone@example.com"));
      expect(state.formError).toBe("Requests to join are not open yet.");
      expect(state.success).toBeUndefined();
      expect(rpc).not.toHaveBeenCalled();
      expect(withinLimit).not.toHaveBeenCalled();
    });
  }

  it("works exactly as before when the switch is \"true\"", async () => {
    vi.stubEnv("JOIN_FORM_ENABLED", "true");
    const state = await requestToJoin({}, form("someone@example.com"));
    expect(state.success).toMatch(/If we can offer you a place/);
    expect(rpc).toHaveBeenCalledWith("request_to_join", { p_email: "someone@example.com", p_note: null });
  });
});
