import { z } from "zod";

// Modo de prueba de la API de lectura (brief-11.3, D-7), con la conducta del de ingestión
// (brief-6.5.3, D-4) y variables propias: encender la lectura no enciende la escritura. Apagada
// salvo que READ_API_ENABLED sea "true"; encendida, solo acepta las credenciales de
// READ_API_ALLOWED_CREDENTIALS. Una configuración inválida la apaga.

export type ReadApiConfig =
  | { enabled: false; invalid: boolean }
  | { enabled: true; allowedCredentials: ReadonlySet<string> };

type ReadApiEnv = Record<string, string | undefined>;

const uuidSchema = z.uuid();

export function readReadApiConfig(
  env: ReadApiEnv = process.env,
): ReadApiConfig {
  const enabled = env.READ_API_ENABLED ?? "";
  if (enabled === "" || enabled === "false") {
    return { enabled: false, invalid: false };
  }
  if (enabled !== "true") return { enabled: false, invalid: true };

  const ids = (env.READ_API_ALLOWED_CREDENTIALS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  if (!ids.every((id) => uuidSchema.safeParse(id).success)) {
    return { enabled: false, invalid: true };
  }
  // Vacía, rechaza todo.
  return {
    enabled: true,
    allowedCredentials: new Set(ids.map((id) => id.toLowerCase())),
  };
}

export function isReadCredentialAllowed(
  config: Extract<ReadApiConfig, { enabled: true }>,
  credentialId: string,
): boolean {
  return config.allowedCredentials.has(credentialId.toLowerCase());
}
