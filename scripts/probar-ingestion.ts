// Prueba el contrato de ingestión v2 contra un entorno desplegado (brief-12.3, D-11 y AC-14): manda
// los fixtures de `tests/fixtures/ingestion/v2/` a través del borde real (nginx, TLS y
// TRUSTED_PROXY) con una credencial de ingestión, y comprueba cada respuesta contra el contrato
// (docs/contracts/ingestion-v2.md). Uso:
//
//   CRM_BASE_URL=https://staging.vixoraai.app CRM_INGEST_TOKEN=crm_ing_… \
//     npx tsx scripts/probar-ingestion.ts
//
// Lo que hace y lo que no, declarado:
// - **escribe**: un cliente, una conversación y sus mensajes en la organización de la credencial,
//   con teléfonos sintéticos del rango de los fixtures (+54911555500xx, brief-12.1, D-2). Cada
//   corrida lleva un sufijo propio en sus referencias, así que se puede repetir sin chocar con la
//   anterior; el cliente del teléfono se reutiliza;
// - las fechas de los fixtures se reemplazan por la hora de la corrida, para que el evento no
//   quede en el pasado del dashboard. El resto del payload es el del fixture;
// - consume unos veinte pedidos del límite de la credencial;
// - **nunca imprime el token**, ni entero ni en parte, ni el teléfono ni el texto de los mensajes;
// - son requests sintéticos, armados por este script: **no** es evidencia de compatibilidad con
//   ningún emisor real (eso es la 12.3.3).

import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const BASE = process.env.CRM_BASE_URL;
const TOKEN = process.env.CRM_INGEST_TOKEN;
const RUTA = "/api/ingestion/v2/events";
const FIXTURES = path.join(process.cwd(), "tests/fixtures/ingestion/v2");

type Payload = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const corrida = randomUUID().slice(0, 8);
const correlacion = `prueba-12-3-2-${corrida}`;
const fallas: string[] = [];
let pedidos = 0;

function fallar(detalle: string): void {
  fallas.push(detalle);
  console.log(`  FALLA: ${detalle}`);
}

function fixture(nombre: string): Payload {
  const datos = JSON.parse(
    readFileSync(path.join(FIXTURES, `${nombre}.json`), "utf8"),
  );
  return datos.payload as Payload;
}

// Referencias propias de la corrida y fechas de ahora, sin tocar la forma del evento.
function deLaCorrida(payload: Payload, desfaseMs = 0): Payload {
  const copia = structuredClone(payload);
  const ahora = new Date(Date.now() - 60_000 + desfaseMs);
  copia.event_id = `${copia.event_id}-${corrida}`;
  copia.occurred_at = ahora.toISOString();
  if (copia.conversation?.external_ref) {
    copia.conversation.external_ref = `${copia.conversation.external_ref}-${corrida}`;
  }
  if (copia.message) {
    copia.message.external_ref = `${copia.message.external_ref}-${corrida}`;
    copia.message.sent_at = new Date(ahora.getTime() - 500).toISOString();
  }
  return copia;
}

// Las respuestas de éxito de v2, estrictas: un campo de más (un id interno, el teléfono, el texto)
// es una falla.
const conversacion = z.strictObject({
  external_ref: z.string().min(1),
  status: z.enum(["open", "pending", "closed"]),
});
const exitoConversacion = z.strictObject({
  contract_version: z.literal("2"),
  event_id: z.string(),
  result: z.enum(["accepted", "duplicate"]),
  conversation: conversacion.nullable(),
});
const exitoCliente = z.strictObject({
  contract_version: z.literal("2"),
  event_id: z.string(),
  result: z.enum(["accepted", "duplicate"]),
  client: z
    .strictObject({
      id: z.uuid(),
      display_name: z.string(),
      is_active: z.boolean(),
    })
    .nullable(),
});
const exitoMensaje = z.strictObject({
  contract_version: z.literal("2"),
  event_id: z.string(),
  result: z.enum(["accepted", "duplicate"]),
  conversation_external_ref: z.string(),
  message_external_ref: z.string(),
});
const error = z.strictObject({
  code: z.string(),
  request_id: z.uuid(),
  fields: z.array(z.string()).optional(),
  rule: z.string().optional(),
  reason: z.string().optional(),
});

async function enviar(
  cuerpo: unknown,
  opciones: { token?: string | null; correlacion?: string } = {},
): Promise<Response> {
  const token = opciones.token === undefined ? TOKEN : opciones.token;
  pedidos++;
  return fetch(`${BASE}${RUTA}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": opciones.correlacion ?? correlacion,
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(cuerpo),
  });
}

// Comprueba estado, cabeceras del borde y cuerpo. Devuelve el cuerpo si pasó el esquema.
async function espera<T extends z.ZodType>(
  titulo: string,
  respuesta: Response,
  estado: number,
  esquema: T,
): Promise<z.infer<T> | null> {
  console.log(
    `\n${titulo} → ${respuesta.status} (request_id ${respuesta.headers.get("x-request-id") ?? "—"})`,
  );
  if (respuesta.status !== estado) {
    fallar(`${titulo}: respondió ${respuesta.status}, se esperaba ${estado}`);
    return null;
  }
  if (respuesta.headers.get("cache-control") !== "no-store") {
    fallar(`${titulo}: sin Cache-Control: no-store`);
  }
  const cuerpo: unknown = await respuesta.json();
  const resultado = esquema.safeParse(cuerpo);
  if (!resultado.success) {
    fallar(`${titulo}: fuera del contrato: ${resultado.error.message}`);
    return null;
  }
  return resultado.data;
}

function correlacionDevuelta(titulo: string, respuesta: Response): void {
  if (respuesta.headers.get("x-correlation-id") !== correlacion) {
    fallar(`${titulo}: no devolvió el X-Correlation-Id que se mandó`);
  }
}

async function exito<T extends z.ZodType>(
  titulo: string,
  payload: Payload,
  estado: number,
  esquema: T,
): Promise<z.infer<T> | null> {
  const respuesta = await enviar(payload);
  correlacionDevuelta(titulo, respuesta);
  return espera(titulo, respuesta, estado, esquema);
}

async function main(): Promise<void> {
  if (!BASE || !TOKEN) {
    throw new Error("Faltan CRM_BASE_URL o CRM_INGEST_TOKEN.");
  }
  console.log(`# Prueba del contrato de ingestión v2 — ${BASE}${RUTA}`);
  console.log(`Corrida ${corrida}, correlación ${correlacion}`);

  // Un turno: cliente, audio entrante, respuesta del agente, reenvío y derivación.
  const cliente = await exito(
    "client.resolved",
    deLaCorrida(fixture("valid-client-resolved")),
    200,
    exitoCliente,
  );
  if (cliente) console.log(`  cliente activo: ${cliente.client?.is_active}`);

  const entrada = deLaCorrida(fixture("valid-conversation-resolved-audio"));
  const resuelta = await exito(
    "conversation.resolved (audio)",
    entrada,
    200,
    exitoConversacion,
  );
  // La respuesta del agente va a la conversación que devolvió el CRM, como dice la guía.
  const referencia =
    resuelta?.conversation?.external_ref ?? entrada.conversation.external_ref;
  console.log(
    `  conversación: ${referencia} · ${resuelta?.conversation?.status}`,
  );

  const respuestaAgente = deLaCorrida(
    fixture("valid-message-recorded-agent"),
    100,
  );
  respuestaAgente.conversation.external_ref = referencia;
  await exito("message.recorded (agente)", respuestaAgente, 201, exitoMensaje);
  const reenvio = await exito(
    "message.recorded (reenvío idéntico)",
    respuestaAgente,
    200,
    exitoMensaje,
  );
  if (reenvio && reenvio.result !== "duplicate") {
    fallar("el reenvío idéntico no respondió duplicate");
  }

  const imagen = deLaCorrida(
    fixture("valid-message-recorded-person-image"),
    200,
  );
  imagen.conversation.external_ref = referencia;
  await exito("message.recorded (persona, imagen)", imagen, 201, exitoMensaje);

  await exito(
    "message.recorded (entrada sin teléfono)",
    deLaCorrida(fixture("valid-message-recorded-inbound-without-phone"), 300),
    201,
    exitoMensaje,
  );

  const derivacion = deLaCorrida(fixture("valid-conversation-escalated"), 400);
  derivacion.conversation.external_ref = referencia;
  const derivada = await exito(
    "conversation.escalated",
    derivacion,
    200,
    exitoConversacion,
  );
  if (derivada && derivada.conversation?.status !== "pending") {
    fallar("la derivación no dejó la conversación en pending");
  }

  // Los tres CONFLICT que el emisor puede recibir en este recorrido.
  const repetido = { ...respuestaAgente, event_id: `otra-${corrida}` };
  const conflicto = await exito(
    "409 mensaje ya registrado",
    repetido,
    409,
    error,
  );
  if (conflicto && conflicto.reason !== "message_already_recorded") {
    fallar(
      `409: reason ${conflicto.reason}, se esperaba message_already_recorded`,
    );
  }
  const cambiado = structuredClone(respuestaAgente);
  cambiado.message.body_text = "Otro texto";
  const mismatch = await exito("409 otro contenido", cambiado, 409, error);
  if (mismatch && mismatch.reason !== "event_payload_mismatch") {
    fallar(
      `409: reason ${mismatch.reason}, se esperaba event_payload_mismatch`,
    );
  }

  // Cada fixture inválido, con los campos que espera.
  for (const archivo of readdirSync(FIXTURES).filter((f) =>
    f.startsWith("invalid-"),
  )) {
    const datos = JSON.parse(
      readFileSync(path.join(FIXTURES, archivo), "utf8"),
    );
    const cuerpo = await exito(
      `400 ${archivo}`,
      deLaCorrida(datos.payload),
      400,
      error,
    );
    if (
      cuerpo &&
      JSON.stringify(cuerpo.fields) !== JSON.stringify(datos.expected.fields)
    ) {
      fallar(
        `${archivo}: fields ${JSON.stringify(cuerpo.fields)}, se esperaba ${JSON.stringify(datos.expected.fields)}`,
      );
    }
  }

  // El borde: correlación inválida y sin credencial.
  const invalida = await enviar(deLaCorrida(fixture("valid-client-resolved")), {
    correlacion: "a".repeat(201),
  });
  const cuerpoInvalida = await espera(
    "400 correlación inválida",
    invalida,
    400,
    error,
  );
  if (cuerpoInvalida && cuerpoInvalida.fields?.[0] !== "correlation_id") {
    fallar("la correlación inválida no nombró correlation_id");
  }
  const anonimo = await enviar(deLaCorrida(fixture("valid-client-resolved")), {
    token: null,
  });
  await espera("401 sin credencial", anonimo, 401, error);
  if (anonimo.headers.get("www-authenticate") !== "Bearer") {
    fallar("el 401 no trae WWW-Authenticate: Bearer");
  }

  console.log(`\nPedidos enviados: ${pedidos}`);
  console.log(`**Fallas: ${fallas.length}**`);
  if (fallas.length > 0) process.exitCode = 1;
}

main().catch((problema: unknown) => {
  // El mensaje de un error de fetch no incluye las cabeceras, así que el token no sale por acá.
  console.error(problema instanceof Error ? problema.message : problema);
  process.exitCode = 1;
});
