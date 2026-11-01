import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "rls",
          include: ["tests/rls/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // One shared database: run files one after another.
          fileParallelism: false,
        },
      },
    ],
  },
});
