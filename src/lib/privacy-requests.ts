import { z } from "zod";
import { emailSchema } from "@/lib/validation";

export const REQUEST_TYPES = [
  "question",
  "access",
  "correction",
  "deletion",
  "restriction",
  "objection",
  "withdraw_consent",
  "dispatch_removal",
  "complaint",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

/** Plain words for the drop-down, and a one-line help for each. */
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  question: "I have a question about my data",
  access: "I want to see the data you hold about me",
  correction: "I want something corrected",
  deletion: "I want my account or data deleted",
  restriction: "I want you to limit how you use my data",
  objection: "I object to how you use my data",
  withdraw_consent: "I want to withdraw a consent I gave",
  dispatch_removal: "I want a Dispatch looked at or removed",
  complaint: "I want to make a complaint",
};

export const STATUSES = ["new", "acknowledged", "in_progress", "closed"] as const;
export type RequestStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<RequestStatus, string> = { new: "New", acknowledged: "Acknowledged", in_progress: "In progress", closed: "Closed" };

export const MAX_MESSAGE = 5000;

export const privacyRequestSchema = z.object({
  type: z.enum(REQUEST_TYPES, "Choose what your message is about."),
  email: emailSchema,
  message: z.string().trim().min(1, "Write your message.").max(MAX_MESSAGE, `Keep your message to ${MAX_MESSAGE.toLocaleString("en-GB")} characters or fewer.`),
});

/** Days left until due; negative when overdue. */
export function daysUntil(due: string, now = Date.now()): number {
  return Math.ceil((Date.parse(due) - now) / 86_400_000);
}

/** Highlight when under 7 days left, or overdue, and the request is still open. */
export function dueState(status: string, due: string, now = Date.now()): "overdue" | "soon" | "ok" | "closed" {
  if (status === "closed") return "closed";
  const d = (Date.parse(due) - now) / 86_400_000;
  if (d < 0) return "overdue";
  if (d < 7) return "soon";
  return "ok";
}
