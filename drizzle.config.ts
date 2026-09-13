import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// En local se lee .env; en CI las variables llegan del entorno (brief-2.4, D-4).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/*/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
