import { existsSync } from "node:fs";
import {
  createIngestionCredential,
  revokeIngestionCredential,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";

// Crea o revoca una credencial de servicio (brief-6.5.3, D-2). Solo uso local:
//   npm run ingestion:credential -- create --org <organization_id> --source <source> [--scope ingest|read|context]
//   npm run ingestion:credential -- revoke --id <credential_id>
// El token se imprime una sola vez y no se guarda en ningún lado. Sin --scope, la credencial es de
// ingestión; con --scope read, de la API de lectura (brief-11.3, D-2), y con --scope context, del
// historial de conversaciones de la API de lectura (brief-12.4, D-6).

const usage =
  "Uso: npm run ingestion:credential -- create --org <organization_id> --source <source> [--scope ingest|read|context]\n" +
  "     npm run ingestion:credential -- revoke --id <credential_id>";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const [command, ...args] = process.argv.slice(2);

  if (command === "create") {
    const organizationId = option(args, "--org");
    const source = option(args, "--source");
    const scope = option(args, "--scope") ?? "ingest";
    if (organizationId === undefined || source === undefined) {
      throw new Error(usage);
    }
    const result = await createIngestionCredential(
      organizationId,
      source,
      scope,
    );
    if (!result.ok) {
      throw new Error(`Datos inválidos: ${result.fields.join(", ")}.`);
    }
    console.log(`Credencial creada: ${result.credentialId}`);
    console.log(`Token (se muestra una sola vez): ${result.token}`);
    console.log(
      scope === "read" || scope === "context"
        ? "Para aceptarla, sumá el id a READ_API_ALLOWED_CREDENTIALS y poné READ_API_ENABLED=true."
        : "Para aceptarla, sumá el id a INGESTION_ALLOWED_CREDENTIALS y poné INGESTION_ENABLED=true.",
    );
    return;
  }

  if (command === "revoke") {
    const credentialId = option(args, "--id");
    if (credentialId === undefined) throw new Error(usage);
    const revoked = await revokeIngestionCredential(credentialId);
    console.log(
      revoked
        ? `Credencial revocada: ${credentialId}`
        : "No existe una credencial activa con ese id.",
    );
    return;
  }

  throw new Error(usage);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) await getDb().$client.end();
  });
