import { z } from "zod";

// Shared form rules. Messages are written for the person filling in the form:
// what is wrong and what to do next.

export const HANDLE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

export const handleSchema = z
  .string()
  .trim()
  .min(3, "Your handle needs at least 3 characters.")
  .max(20, "Your handle can be at most 20 characters.")
  .regex(/^[A-Za-z]/, "Start your handle with a letter.")
  .regex(HANDLE_PATTERN, "Use only letters, numbers and underscores (_). No spaces.");

export const MIN_PASSWORD_LENGTH = 10;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter your email address in the form name@example.com."));

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(72, "Your password can be at most 72 characters.");

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{8,32}$/, "Check your invite code. It is in your invitation email, for example TGS-ABCD-EFGH.");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  inviteCode: inviteCodeSchema,
  ageConfirmed: z.literal(true, "Please tick the box to confirm you are 18 or over."),
  publicAcknowledged: z.literal(true, "Please tick the box to confirm you understand that your Dispatches are public."),
  termsAccepted: z.literal(true, "Please tick the box to agree to the terms of use and confirm you have read the privacy policy."),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

/** The new password follows the same rules as sign-up (passwordSchema), typed twice. */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Type your new password again."),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  displayName: z.string().trim().max(60, "Keep your name to 60 characters or fewer."),
  expertiseTag: z.string().trim().max(40, "Keep your area of expertise to 40 characters or fewer."),
  bio: z.string().trim().max(280, "Keep your short bio to 280 characters or fewer."),
});

/** First message for each field, for showing next to the input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Only allow redirects to paths on this site. */
export function safeNextPath(next: unknown, fallback = "/dossier"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
