import { isUuid } from "./credentials";

// Modo de prueba del endpoint de ingestión (brief-6.5.3, D-4). Apagado salvo que
// INGESTION_ENABLED sea "true"; encendido, solo acepta las credenciales de la allowlist.
// Una configuración inválida apaga el endpoint.

export type IngestionConfig =
  | { enabled: false; invalid: boolean }
  | { enabled: true; allowedCredentials: ReadonlySet<string> };

type IngestionEnv = Record<string, string | undefined>;

export function readIngestionConfig(
  env: IngestionEnv = process.env,
): IngestionConfig {
  const enabled = env.INGESTION_ENABLED ?? "";
  if (enabled === "" || enabled === "false") {
    return { enabled: false, invalid: false };
  }
  if (enabled !== "true") return { enabled: false, invalid: true };

  const raw = env.INGESTION_ALLOWED_CREDENTIALS ?? "";
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  if (!ids.every(isUuid)) return { enabled: false, invalid: true };
  // Vacía, rechaza todo.
  return {
    enabled: true,
    allowedCredentials: new Set(ids.map((id) => id.toLowerCase())),
  };
}

export function isCredentialAllowed(
  config: Extract<IngestionConfig, { enabled: true }>,
  credentialId: string,
): boolean {
  return config.allowedCredentials.has(credentialId.toLowerCase());
}
