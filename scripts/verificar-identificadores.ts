import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/shared/db";

/*
 * Verifica que los identificadores que guardó el emisor no lleven el teléfono de nadie
 * (brief-13.5, D-5; H-4 de la 13.4). Solo lee, y solo informa recuentos: nunca imprime un
 * identificador ni un teléfono.
 *
 *   npx tsx scripts/verificar-identificadores.ts --org <organization_id>
 *
 * Recorre los identificadores del emisor de una organización:
 *   - ingestion_events.external_ref, que es el event_id;
 *   - conversations.external_ref y messages.external_ref.
 * Y busca en cada uno los últimos 8 dígitos del teléfono de cada cliente de la organización,
 * de tres formas:
 *   - en claro, como en un remoteJid;
 *   - decodificado de base64, estándar o url-safe, como lo lleva un wamid de la API oficial
 *     según su formato público (no verificado en este proyecto);
 *   - decodificado de hexadecimal.
 * Los últimos 8 dígitos alcanzan el número con y sin el 9 de los móviles argentinos, y con y sin
 * código de país.
 *
 * Un teléfono que no es de un cliente (una conversación sin cliente) no está en la base. Para
 * buscarlo igual, se pasa en la variable de entorno VERIFICAR_TELEFONO, en formato E.164, desde
 * la terminal del operador: nunca por argumento, que queda en el historial y en `ps`.
 *
 * Sale con 1 si algún identificador lleva un teléfono, y con 2 si no hay ningún teléfono para
 * buscar, porque entonces no prueba nada. En el primer mensaje controlado, la salida 1 es la
 * condición de detención 2 del brief-13.5.
 */

export type IdentifierTable = "ingestion_events" | "conversations" | "messages";

export type Encoding = "plain" | "base64" | "hex";

export type TableReport = {
  table: IdentifierTable;
  checked: number;
  plain: number;
  base64: number;
  hex: number;
};

export type IdentifierReport = {
  phones: number;
  tables: TableReport[];
  clean: boolean;
};

const TAIL_DIGITS = 8;
// Un trozo más corto no alcanza para llevar 8 dígitos codificados en base64.
const MIN_ENCODED_LENGTH = 12;
const E164 = /^\+[1-9][0-9]{1,14}$/;

/** Lo que se busca de un teléfono E.164: sus últimos 8 dígitos. */
export function phoneNeedle(phoneE164: string): string {
  return phoneE164.replace(/\D/g, "").slice(-TAIL_DIGITS);
}

// Trozos que pueden ser base64 (estándar o url-safe) o hexadecimal: lo que queda entre los
// separadores habituales de un identificador, como el punto de `wamid.` o el arroba de un JID.
function segments(identifier: string): string[] {
  return identifier
    .split(/[^A-Za-z0-9+/=_-]+/)
    .filter((segment) => segment.length >= MIN_ENCODED_LENGTH);
}

// Decodifica desde cada uno de los cuatro desplazamientos posibles: un prefijo del mismo
// alfabeto (`wa-` antes del base64) correría la alineación y escondería los dígitos. Node
// decodifica con "base64" los dos alfabetos, el estándar y el url-safe, y tolera el relleno.
function base64Decodings(segment: string): string[] {
  const decodings: string[] = [];
  for (let offset = 0; offset < 4; offset++) {
    const part = segment.slice(offset);
    if (part.length < MIN_ENCODED_LENGTH) break;
    decodings.push(Buffer.from(part, "base64").toString("latin1"));
  }
  return decodings;
}

function hexDecodings(segment: string): string[] {
  const decodings: string[] = [];
  for (const run of segment.match(/[0-9a-fA-F]+/g) ?? []) {
    for (const start of [0, 1]) {
      const part = run.slice(start);
      const even = part.slice(0, part.length - (part.length % 2));
      if (even.length >= 2 * TAIL_DIGITS)
        decodings.push(Buffer.from(even, "hex").toString("latin1"));
    }
  }
  return decodings;
}

/** En qué formas aparece alguno de los teléfonos en un identificador. */
export function phoneEncodings(
  identifier: string,
  needles: string[],
): Set<Encoding> {
  const found = new Set<Encoding>();
  const contains = (text: string) => needles.some((n) => text.includes(n));
  if (contains(identifier)) found.add("plain");
  for (const segment of segments(identifier)) {
    if (base64Decodings(segment).some(contains)) found.add("base64");
    if (hexDecodings(segment).some(contains)) found.add("hex");
  }
  return found;
}

export async function verifyIdentifiers(
  db: Pick<Db, "execute">,
  organizationId: string,
  extraPhones: string[] = [],
): Promise<IdentifierReport> {
  const clients = await db.execute<{ phone_e164: string }>(
    sql`select phone_e164 from clients
        where organization_id = ${organizationId} and phone_e164 is not null`,
  );
  const needles = [
    ...new Set(
      [...clients.rows.map((row) => row.phone_e164), ...extraPhones].map(
        phoneNeedle,
      ),
    ),
  ];

  const sources: [IdentifierTable, ReturnType<typeof sql>][] = [
    [
      "ingestion_events",
      sql`select external_ref from ingestion_events where organization_id = ${organizationId}`,
    ],
    [
      "conversations",
      sql`select external_ref from conversations
          where organization_id = ${organizationId} and external_ref is not null`,
    ],
    [
      "messages",
      sql`select external_ref from messages
          where organization_id = ${organizationId} and external_ref is not null`,
    ],
  ];

  const tables: TableReport[] = [];
  for (const [table, query] of sources) {
    const rows = await db.execute<{ external_ref: string }>(query);
    const report: TableReport = {
      table,
      checked: 0,
      plain: 0,
      base64: 0,
      hex: 0,
    };
    for (const { external_ref } of rows.rows) {
      report.checked++;
      for (const encoding of phoneEncodings(external_ref, needles))
        report[encoding]++;
    }
    tables.push(report);
  }
  return {
    phones: needles.length,
    tables,
    clean: tables.every((t) => t.plain + t.base64 + t.hex === 0),
  };
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const organizationId = option(process.argv.slice(2), "--org");
  if (!organizationId)
    throw new Error(
      "Uso: npx tsx scripts/verificar-identificadores.ts --org <organization_id>",
    );
  const extra = process.env.VERIFICAR_TELEFONO?.trim();
  // El valor no se repite en el error: es un teléfono real.
  if (extra && !E164.test(extra))
    throw new Error("VERIFICAR_TELEFONO no está en formato E.164.");

  const report = await verifyIdentifiers(
    getDb(),
    organizationId,
    extra ? [extra] : [],
  );
  console.log(
    `Teléfonos buscados: ${report.phones}${extra ? " (uno de VERIFICAR_TELEFONO)" : ""}.`,
  );
  for (const t of report.tables) {
    console.log(
      `${t.table}: ${t.checked} identificadores; con un teléfono en claro ${t.plain}, en base64 ${t.base64}, en hexadecimal ${t.hex}.`,
    );
  }
  if (report.phones === 0) {
    // Sale distinto de 0: un «ningún identificador lleva un teléfono» sin teléfonos no es un pase.
    console.log("Sin teléfonos para buscar: el resultado no prueba nada.");
    process.exitCode = 2;
    return;
  }
  if (report.clean) {
    console.log("Ningún identificador lleva un teléfono buscado.");
  } else {
    console.log(
      "HAY identificadores con un teléfono. No se imprimen. Condición de detención 2 del brief-13.5.",
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("scripts/verificar-identificadores.ts")
) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (process.env.DATABASE_URL) await getDb().$client.end();
    });
}
