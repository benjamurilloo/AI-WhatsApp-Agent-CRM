import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// En local se lee .env; en CI las variables llegan del entorno (brief-2.4, D-4).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "guards",
          include: ["tests/guards/**/*.test.ts"],
          environment: "node",
          testTimeout: 30000,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
