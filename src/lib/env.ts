import { z } from "zod";

// Environment access. Values are read lazily so pages that need no secrets
// (policy pages, for example) build without them. Error messages name the
// missing variable but never print a value.

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")} (${issue.code === "invalid_type" ? "missing" : "invalid"})`)
    .join(", ");
}

export function publicEnv(): PublicEnv {
  // NEXT_PUBLIC_ values must be referenced literally so Next.js inlines them in the browser bundle.
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Missing or invalid environment variables: ${describeIssues(parsed.error)}`);
  }
  return parsed.data;
}

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called in the browser");
  }
  const parsed = serverSchema.safeParse({
    ...publicEnv(),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Missing or invalid environment variables: ${describeIssues(parsed.error)}`);
  }
  return parsed.data;
}
