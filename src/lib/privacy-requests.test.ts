import { describe, expect, it } from "vitest";
import { REQUEST_TYPES, dueState, privacyRequestSchema } from "./privacy-requests";

describe("privacy request form rules", () => {
  it("accepts a complete request and lowercases the email", () => {
    const r = privacyRequestSchema.parse({ type: "access", email: " Jane@Example.com ", message: "Please send my data." });
    expect(r.email).toBe("jane@example.com");
  });
  it("has the nine types in the brief", () => {
    expect([...REQUEST_TYPES]).toEqual(["question", "access", "correction", "deletion", "restriction", "objection", "withdraw_consent", "dispatch_removal", "complaint"]);
  });
  it("needs a type, a valid email and a message", () => {
    expect(privacyRequestSchema.safeParse({ type: "nope", email: "a@b.co", message: "x" }).success).toBe(false);
    expect(privacyRequestSchema.safeParse({ type: "access", email: "not-an-email", message: "x" }).success).toBe(false);
    expect(privacyRequestSchema.safeParse({ type: "access", email: "a@b.co", message: "  " }).success).toBe(false);
  });
});

describe("due-date highlighting", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const day = 86_400_000;
  it("highlights under 7 days and overdue, but not closed requests", () => {
    expect(dueState("new", new Date(now + 20 * day).toISOString(), now)).toBe("ok");
    expect(dueState("new", new Date(now + 6 * day).toISOString(), now)).toBe("soon");
    expect(dueState("in_progress", new Date(now - day).toISOString(), now)).toBe("overdue");
    expect(dueState("closed", new Date(now - 30 * day).toISOString(), now)).toBe("closed");
  });
});
