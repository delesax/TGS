import { describe, expect, it } from "vitest";
import { inviteEmail } from "./invite-email";

describe("the invitation email", () => {
  const email = inviteEmail("https://thegrandstrategist.com", { invite_id: "abc", code: "TGS-AAAA-BBBB-CCCC-DDDD-EEEE", expires_at: "2026-12-08T10:00:00Z" });

  it("links to the live sign-up page with the code, in both the text and the HTML", () => {
    const href = "https://thegrandstrategist.com/signup?code=TGS-AAAA-BBBB-CCCC-DDDD-EEEE";
    expect(email.text).toContain(href);
    expect(email.html).toContain(`href="${href}"`);
    expect(email.subject).toBe("Your invitation to The Grand Strategist");
  });

  it("says it works once, for this address, until the expiry, and why it was sent; it has no stop link", () => {
    expect(email.text).toMatch(/works once/);
    expect(email.text).toMatch(/this email address/);
    expect(email.text).toMatch(/8 December 2026/);
    expect(email.text).toMatch(/invited this email address/);
    expect(email.text).not.toMatch(/unsubscribe|stop these emails/i);
  });

  it("does not put a note, a handle or anything personal in it", () => {
    expect(email.text).not.toMatch(/@\w+,|Hello @/);
  });
});
