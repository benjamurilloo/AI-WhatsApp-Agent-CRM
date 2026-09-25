// Prueba la API de lectura v1 contra un entorno desplegado (brief-11.4, D-6 y AC-3): pide cada
// ruta con una credencial de lectura y valida **toda** respuesta de éxito con los mismos esquemas
// estrictos que usan los tests de integración (`src/app/api/read/v1/contract.ts`). Uso:
//
//   CRM_BASE_URL=https://staging.vixoraai.app CRM_READ_TOKEN=crm_read_… \
//     npx tsx scripts/probar-api-lectura.ts
//
// Está pensado para la organización del seed del piloto (`seeds/pilot.ts`): además del contrato,
// comprueba que no sale ningún producto inactivo ni ninguna entrada no vigente de ese seed. Contra
// otra organización esas dos comprobaciones no significan nada, y el script lo avisa.
//
// Lo que hace y lo que no, declarado:
// - **no escribe nada**: solo pide GET. Cada pedido queda en el log del servidor, con su
//   `request_id`, y consume el límite de tasa de la credencial (unos quince pedidos);
// - **nunca imprime el token**, ni entero ni en parte;
// - imprime los productos y las entradas que devuelve, para que la persona del piloto juzgue si
//   le alcanzarían al agente para contestar (D-4, «desde el lado del agente»). Ese juicio no es
//   evidencia de integración: el agente no participa;
// - no mide tiempos de respuesta de forma útil: una sola corrida desde otra red.

import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  errorResponseSchema,
  knowledgeListResponseSchema,
  productListResponseSchema,
  productResponseSchema,
} from "@/app/api/read/v1/contract";
import {
  PILOT_ENTRIES,
  PILOT_PRODUCTS,
  pilotEntryId,
  pilotProductId,
} from "../seeds/pilot";

const BASE = process.env.CRM_BASE_URL;
const TOKEN = process.env.CRM_READ_TOKEN;

// Preguntas típicas de un cliente, convertidas en lo que el agente buscaría.
const PRODUCT_QUERIES = ["reacondicionado", "Aria", "auriculares", "Novatek"];
const KNOWLEDGE_QUERIES = ["envios", "garantia", "horario"];

const fallas: string[] = [];
const correlacion = `piloto-11-4-${randomUUID()}`;

function fallar(detalle: string): void {
  fallas.push(detalle);
  console.log(`  FALLA: ${detalle}`);
}

async function pedir(
  ruta: string,
  opciones: { token?: string | null } = {},
): Promise<Response> {
  const token = opciones.token === undefined ? TOKEN : opciones.token;
  return fetch(`${BASE}/api/read/v1${ruta}`, {
    headers: {
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      "x-correlation-id": correlacion,
    },
  });
}

// Una respuesta de éxito: 200, las cabeceras del borde y el cuerpo contra el esquema estricto.
async function valida<T extends z.ZodType>(
  ruta: string,
  esquema: T,
): Promise<z.infer<T> | null> {
  const respuesta = await pedir(ruta);
  const requestId = respuesta.headers.get("x-request-id");
  console.log(`\nGET ${ruta} → ${respuesta.status} (request_id ${requestId})`);
  if (respuesta.status !== 200) {
    fallar(`${ruta} respondió ${respuesta.status}, no 200`);
    return null;
  }
  if (respuesta.headers.get("cache-control") !== "no-store") {
    fallar(`${ruta} sin Cache-Control: no-store`);
  }
  if (respuesta.headers.get("x-correlation-id") !== correlacion) {
    fallar(`${ruta} no devolvió el X-Correlation-Id que se mandó`);
  }
  const cuerpo: unknown = await respuesta.json();
  const resultado = esquema.safeParse(cuerpo);
  if (!resultado.success) {
    fallar(`${ruta} fuera del contrato: ${resultado.error.message}`);
    return null;
  }
  return resultado.data;
}

async function rechazo(
  ruta: string,
  estado: number,
  opciones: { token?: string | null } = {},
): Promise<void> {
  const respuesta = await pedir(ruta, opciones);
  console.log(
    `\nGET ${ruta} (${opciones.token === null ? "sin credencial" : "con credencial"}) → ${respuesta.status}`,
  );
  if (respuesta.status !== estado) {
    fallar(`${ruta} respondió ${respuesta.status}, se esperaba ${estado}`);
    return;
  }
  const cuerpo: unknown = await respuesta.json();
  if (!errorResponseSchema.safeParse(cuerpo).success) {
    fallar(`${ruta}: el cuerpo del ${estado} no es el de error del contrato`);
  }
}

function precio(p: { amount: string; currency: string } | null): string {
  return p === null ? "sin precio" : `${p.amount} ${p.currency}`;
}

async function main(): Promise<void> {
  if (!BASE || !TOKEN) {
    throw new Error("Faltan CRM_BASE_URL o CRM_READ_TOKEN.");
  }
  console.log(`# Prueba de la API de lectura v1 — ${BASE}`);
  console.log(`Correlación de esta corrida: ${correlacion}`);

  const inactivos = new Set(
    PILOT_PRODUCTS.filter((p) => !p.isActive).map((p) =>
      pilotProductId(p.index),
    ),
  );
  const pilotoIds = new Set(PILOT_PRODUCTS.map((p) => pilotProductId(p.index)));
  let vistosDelPiloto = 0;
  let primerProducto: string | null = null;

  for (const q of PRODUCT_QUERIES) {
    const ruta = `/products?q=${encodeURIComponent(q)}&limit=10`;
    const cuerpo = await valida(ruta, productListResponseSchema);
    if (!cuerpo) continue;
    console.log(`  ${cuerpo.items.length} productos:`);
    for (const item of cuerpo.items) {
      console.log(
        `  - ${item.name} · ${item.brand ?? "sin marca"} · ${item.category ?? "sin categoría"} · ${item.condition} · ${precio(item.price)} · ${item.stock_status}`,
      );
      if (inactivos.has(item.product_id)) {
        fallar(`${ruta} devolvió el producto inactivo ${item.product_id}`);
      }
      if (pilotoIds.has(item.product_id)) vistosDelPiloto++;
      primerProducto ??= item.product_id;
    }
  }

  if (primerProducto) {
    const cuerpo = await valida(
      `/products/${primerProducto}`,
      productResponseSchema,
    );
    if (cuerpo) console.log(`  detalle: ${cuerpo.product.name}`);
  } else {
    fallar("ninguna búsqueda devolvió un producto para pedir su detalle");
  }

  // Un inactivo del seed da 404, igual que uno inexistente: el contrato no los distingue.
  const inactivo = [...inactivos][0]!;
  await rechazo(`/products/${inactivo}`, 404);
  await rechazo(`/products/${randomUUID()}`, 404);
  await rechazo("/products?q=cafe", 401, { token: null });

  const noVigentes = new Set(
    PILOT_ENTRIES.flatMap((entry, index) =>
      !entry.isActive ||
      (entry.validFrom !== null && entry.validFrom > 0) ||
      (entry.validUntil !== null && entry.validUntil < 0)
        ? [pilotEntryId(index)]
        : [],
    ),
  );
  for (const ruta of [
    "/knowledge?limit=50",
    ...KNOWLEDGE_QUERIES.map((q) => `/knowledge?q=${encodeURIComponent(q)}`),
  ]) {
    const cuerpo = await valida(ruta, knowledgeListResponseSchema);
    if (!cuerpo) continue;
    console.log(`  ${cuerpo.items.length} entradas:`);
    for (const item of cuerpo.items) {
      console.log(`  - [${item.category}] ${item.title}: ${item.content}`);
      if (noVigentes.has(item.entry_id)) {
        fallar(`${ruta} devolvió la entrada no vigente ${item.entry_id}`);
      }
    }
  }

  if (vistosDelPiloto === 0) {
    console.log(
      "\nAVISO: ningún producto es del seed del piloto. Las comprobaciones de inactivos y de " +
        "vigencia no significan nada contra esta organización.",
    );
  }

  console.log(`\n**Fallas: ${fallas.length}**`);
  if (fallas.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  // El mensaje de un error de fetch no incluye las cabeceras, así que el token no sale por acá.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
