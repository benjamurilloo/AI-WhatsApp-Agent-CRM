import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { E2E_INGESTION_CREDENTIAL_ID } from "./tests/e2e/global-setup";
import { e2eDatabaseUrl } from "./tests/integration/test-database";

// End-to-end con Chromium sobre el build de producción (brief-3.5, D-8).
// Requiere npm run build antes; en CI es el paso anterior.
if (existsSync(".env")) process.loadEnvFile(".env");

const PORT = 3100;
// Segundo servidor, con la ingestión apagada: es la única forma de ver en el navegador el estado
// "No disponible" de la métrica 12, porque el primero la enciende para el spec de ingestión
// (brief-6.5.3, D-6; brief-7.4). Comparte la base _e2e, y los tests corren en serie.
const PORT_SIN_INGESTION = 3101;
const SIN_INGESTION_SPEC = /dashboard-sin-ingestion\.spec\.ts/;
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Comparten la base _e2e y la reponen antes de cada test: en serie y sin reintentos.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  // Cada ingreso verifica un hash argon2 en el servidor.
  expect: { timeout: 10_000 },
  use: {
    // localhost es un contexto seguro para Chromium: acepta la cookie Secure de next start.
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: SIN_INGESTION_SPEC,
    },
    {
      name: "chromium-sin-ingestion",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${PORT_SIN_INGESTION}`,
      },
      testMatch: SIN_INGESTION_SPEC,
    },
  ],
  webServer: [
    {
      command: `npx next start --port ${PORT}`,
      // /login sin cookie no consulta la base: el servidor puede arrancar antes que la base _e2e.
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...(process.env as Record<string, string>),
        ...(databaseUrl ? { DATABASE_URL: e2eDatabaseUrl(databaseUrl) } : {}),
        NEXT_TELEMETRY_DISABLED: "1",
        // Modo de prueba de la ingestión, solo con la credencial sintética (brief-6.5.3, D-4).
        INGESTION_ENABLED: "true",
        INGESTION_ALLOWED_CREDENTIALS: E2E_INGESTION_CREDENTIAL_ID,
      },
    },
    {
      command: `npx next start --port ${PORT_SIN_INGESTION}`,
      url: `http://localhost:${PORT_SIN_INGESTION}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...(process.env as Record<string, string>),
        ...(databaseUrl ? { DATABASE_URL: e2eDatabaseUrl(databaseUrl) } : {}),
        NEXT_TELEMETRY_DISABLED: "1",
        // Sin ingestión configurada: la métrica 12 tiene que decir "No disponible".
        INGESTION_ENABLED: "false",
        INGESTION_ALLOWED_CREDENTIALS: "",
      },
    },
  ],
});
