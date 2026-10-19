import { z } from "zod";

// La lectura de la cotización (ADR 0025, puntos 4 y 9; brief-29.4.2, D-3 y D-6).
//
// El lector solo trae el valor: consulta DolarAPI, valida la respuesta y le pasa a la base la venta
// como texto, tal como llegó. La suma del ajuste, la comparación, el límite del 10 % y la escritura
// los hace fx_record_reading, en la base (0054). Por eso este archivo nunca convierte la venta a
// number: la toma del texto crudo de la respuesta.
//
// No importa nada de src/: corre con Node quitando los tipos, sin tsx ni el alias @/, y con un rol
// de la base que solo ejecuta dos funciones. Lo fija tests/guards/fx-reader.test.ts.

// El único host al que sale el lector, solo con GET (ADR 0025, punto 9). Fijo en el código, no en
// una variable de entorno: cambiarlo es un cambio revisado.
export const DOLARAPI_BLUE_URL = "https://dolarapi.com/v1/dolares/blue";

const TIMEOUT_MS = 10_000;
// La respuesta mide unos 150 bytes. Más de 4 KB no es la respuesta esperada.
const MAX_BODY_BYTES = 4096;

// Un decimal positivo, con a lo sumo nueve dígitos enteros y seis decimales: el mismo patrón que
// repite fx_record_reading. Sin signo, sin exponente, sin comillas.
const VENTA_PATTERN = /^[0-9]{1,9}(\.[0-9]{1,6})?$/;

// Cualquier valor que siga a "venta": se captura de más y se valida aparte, para que un exponente o
// un signo lleguen a la validación y se rechacen, en lugar de cortarse.
const VENTA_FIELD = /"venta"\s*:\s*([^,}\s]*)/g;

// Lo que tiene que decir la respuesta. Los campos de más no la invalidan; los que se leen, sí.
const responseSchema = z.object({
  moneda: z.literal("USD"),
  casa: z.literal("blue"),
  venta: z.number().positive(),
  fechaActualizacion: z.iso.datetime({ offset: true }),
});

// La venta como texto, si la respuesta la trae una sola vez y con la forma esperada. Una barra
// invertida la invalida: con una clave escapada («"venta"») el texto mostraría una sola venta y
// JSON.parse leería otra (revisión independiente de la 29.4.2, B-6). La respuesta de DolarAPI no
// tiene escapes.
export function extractVenta(body: string): string | null {
  if (body.includes("\\")) return null;
  const found = [...body.matchAll(VENTA_FIELD)];
  if (found.length !== 1) return null;
  const raw = found[0]![1]!;
  return VENTA_PATTERN.test(raw) ? raw : null;
}

export type Reading = { venta: string; observedAt: string };

export type ReadingFailure =
  "network" | "http_status" | "too_large" | "not_json" | "schema" | "venta";

// Lo justo de fetch que usa el lector: el test le pasa uno propio, y la suite nunca llama al host.
export type FetchLike = (
  url: string,
  init: {
    method: "GET";
    redirect: "error";
    signal: AbortSignal;
    headers: Record<string, string>;
  },
) => Promise<{
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
}>;

async function readLimited(
  body: ReadableStream<Uint8Array> | null,
): Promise<string | null> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
}

// Una sola consulta, sin reintentos: la próxima corrida llega en tres horas, y DolarAPI pide no
// repetir la consulta en un bucle. No manda ninguna cabecera con datos del CRM.
export async function fetchReading(
  fetchLike: FetchLike,
): Promise<
  { ok: true; reading: Reading } | { ok: false; reason: ReadingFailure }
> {
  let text: string | null;
  try {
    const response = await fetchLike(DOLARAPI_BLUE_URL, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return { ok: false, reason: "http_status" };
    text = await readLimited(response.body);
  } catch {
    return { ok: false, reason: "network" };
  }
  if (text === null) return { ok: false, reason: "too_large" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not_json" };
  }
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "schema" };
  const venta = extractVenta(text);
  if (venta === null) return { ok: false, reason: "venta" };
  return {
    ok: true,
    reading: { venta, observedAt: parsed.data.fechaActualizacion },
  };
}

// Lo que devuelve fx_record_reading (0054). Un resultado desconocido es una falla.
const ACCEPTED = new Set(["inserted", "confirmed", "not_a_target"]);
const REJECTED = new Set([
  "rejected_invalid",
  "rejected_below_one",
  "rejected_too_large",
  "rejected_large_change",
]);

export type ReaderDatabase = {
  targets(): Promise<string[]>;
  record(
    organizationId: string,
    venta: string,
    observedAt: string,
  ): Promise<string>;
};

// Las dos funciones de la base, por una conexión con el rol del lector.
export function readerDatabase(client: {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}): ReaderDatabase {
  return {
    async targets() {
      const result = await client.query<{ organization_id: string }>(
        "select organization_id from fx_reader_targets()",
      );
      return result.rows.map((row) => row.organization_id);
    },
    async record(organizationId, venta, observedAt) {
      const result = await client.query<{ result: string }>(
        "select fx_record_reading($1, $2, $3) as result",
        [organizationId, venta, observedAt],
      );
      return result.rows[0]?.result ?? "";
    },
  };
}

// Una corrida: devuelve el código de salida. Distinto de cero si la consulta falló o si alguna
// organización quedó rechazada, aunque otras se hayan guardado: así el aviso de vida no sale y la
// alerta suena (ADR 0025, punto 9). Sin organizaciones con fuente automática, no consulta a nadie.
export async function runReader(deps: {
  fetch: FetchLike;
  database: ReaderDatabase;
  log: (line: string) => void;
}): Promise<number> {
  const targets = await deps.database.targets();
  if (targets.length === 0) {
    deps.log("Sin organizaciones con la fuente automática: no se consulta.");
    return 0;
  }
  const fetched = await fetchReading(deps.fetch);
  if (!fetched.ok) {
    deps.log(
      `FALLA: la consulta a DolarAPI no sirvió (${fetched.reason}). No se guardó nada.`,
    );
    return 1;
  }
  const { venta, observedAt } = fetched.reading;
  deps.log(`DolarAPI: venta ${venta}, del ${observedAt}.`);
  let failed = false;
  for (const organizationId of targets) {
    let result: string;
    try {
      result = await deps.database.record(organizationId, venta, observedAt);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : "desconocido";
      deps.log(`FALLA: ${organizationId}: error de la base (${message}).`);
      continue;
    }
    if (!ACCEPTED.has(result)) failed = true;
    const prefix =
      REJECTED.has(result) || !ACCEPTED.has(result) ? "FALLA: " : "";
    deps.log(`${prefix}${organizationId}: ${result || "sin resultado"}.`);
  }
  return failed ? 1 : 0;
}
