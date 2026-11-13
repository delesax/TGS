import type { NextConfig } from "next";

const securityHeaders = [
  // One year, this host only (no includeSubDomains, no preload): browsers ignore it over plain http, so local development is unaffected.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Auth pages read cookies on every request, so we keep the standard dynamic
  // rendering model rather than opting in to Cache Components.
  // The AI prompts are read from prompts/*.md at run time; ship them with every server route.
  outputFileTracingIncludes: { "/**": ["./prompts/**/*.md"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must always be fetched fresh so updates reach people.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
