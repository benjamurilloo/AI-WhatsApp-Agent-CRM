import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./tests/integration/test-database";

// En local se lee .env; en CI las variables llegan del entorno (brief-2.4, D-4).
if (existsSync(".env")) process.loadEnvFile(".env");

// Los tests de integración usan la base <nombre>_test, nunca la de desarrollo (brief-3.1, D-1).
const databaseUrl = process.env.DATABASE_URL;
const integrationEnv = databaseUrl
  ? { DATABASE_URL: testDatabaseUrl(databaseUrl) }
  : {};

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
          globalSetup: ["tests/integration/global-setup.ts"],
          env: integrationEnv,
          // Comparten la base de test y la vacían antes de cada test: en serie.
          fileParallelism: false,
        },
      },
    ],
  },
});
