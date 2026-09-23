// Mide el camino completo de los listados y del dashboard invocando los **servicios reales**
// (9.3, AC-6 y AC-9). Uso:
//
//   set -a; . /etc/crm-staging/migrate.env; set +a
//   npx tsx scripts/medir-caminos.ts <organizationId> [etiqueta]
//
// Por qué está versionado, a diferencia del de la 8.5: aquel vivió en el scratchpad y se perdió,
// así que su tanda no se podía repetir y la 9.3 tuvo que reconstruirla. Un número que no se puede
// volver a medir no es una línea de base, es una anécdota.
//
// Por qué llama a los servicios y no a SQL escrito a mano: una consulta reescrita para el
// `EXPLAIN` se parece a la de la aplicación pero no es la misma, y entonces el plan medido
// tampoco. Acá corre el mismo código que la pantalla. Para obtener el SQL exacto que sale de
// estas llamadas, se enciende antes el registro del rol:
//
//   ALTER ROLE crm_owner SET log_min_duration_statement = 0;   -- y se apaga al terminar
//
// Lo que este script NO mide: concurrencia. Corre una llamada por vez.

import { existsSync } from "node:fs";
import { searchProducts } from "@/modules/catalog";
import {
  getConversationsStarted,
  getActiveConversations,
  getUniqueClients,
  getMessageCounts,
  getMessagesPerConversation,
  getDailyActivity,
  getRespondedConversations,
  getResponseCoverage,
  getFirstResponseTime,
  getStatusDistribution,
} from "@/modules/analytics";
import {
  listConversations,
  searchClientsByLastInteraction,
} from "@/modules/conversations";
import { searchClients } from "@/modules/crm";
import { listProductStock, listStockMovements } from "@/modules/inventory";
import { listMembers, type AuthContext } from "@/modules/organizations";
import { getDb } from "@/shared/db";

const CORRIDAS = 5;

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0
    ? (orden[medio - 1]! + orden[medio]!) / 2
    : orden[medio]!;
}

async function medir(
  nombre: string,
  ejecutar: () => Promise<unknown>,
): Promise<{
  nombre: string;
  mediana: number;
  minimo: number;
  maximo: number;
}> {
  // Una corrida de calentamiento que no cuenta: la primera paga la compilación del plan y la
  // lectura fría de las páginas, y mezclarla con las demás inventa una dispersión que no existe.
  await ejecutar();
  const tiempos: number[] = [];
  for (let i = 0; i < CORRIDAS; i++) {
    const desde = performance.now();
    await ejecutar();
    tiempos.push(performance.now() - desde);
  }
  return {
    nombre,
    mediana: mediana(tiempos),
    minimo: Math.min(...tiempos),
    maximo: Math.max(...tiempos),
  };
}

async function main(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL.");

  const organizationId = process.argv[2];
  if (!organizationId) {
    throw new Error(
      "Uso: npx tsx scripts/medir-caminos.ts <organizationId> [etiqueta]",
    );
  }
  const etiqueta = process.argv[3] ?? organizationId;

  // `getDb` es el mismo singleton que usan los servicios: crearle una conexión aparte mediría
  // un pool distinto del que la aplicación usa de verdad.
  const db = getDb();

  // El admin de la organización, que es quien ve todo: medir con `viewer` daría otros caminos
  // —el teléfono sale enmascarado— y no es el caso más caro.
  const { sql } = await import("drizzle-orm");
  const admin = await db.execute<{ user_id: string }>(
    sql`select user_id from organization_members
         where organization_id = ${organizationId} and role = 'admin'
         order by user_id limit 1`,
  );
  const userId = admin.rows[0]?.user_id;
  if (!userId) {
    throw new Error(`La organización ${organizationId} no tiene ningún admin.`);
  }

  const context: AuthContext = {
    userId,
    organizationId,
    role: "admin",
    mustChangePassword: false,
    sessionExpiresAt: new Date(Date.now() + 3_600_000),
  };

  // Un producto con historial largo: el caso que rompe una paginación, no el promedio.
  const producto = await db.execute<{ id: string; n: number }>(
    sql`select p.id, count(m.id)::int as n
          from products p
          left join inventory_movements m
            on m.organization_id = p.organization_id and m.product_id = p.id
         where p.organization_id = ${organizationId}
         group by p.id order by n desc limit 1`,
  );
  const productoId = producto.rows[0]?.id ?? null;
  const movimientos = producto.rows[0]?.n ?? 0;

  const periodo = { from: "", to: "" };
  const listados: [string, () => Promise<unknown>][] = [
    [
      "catalog.searchProducts (sin texto)",
      () => searchProducts(context, { text: "", activity: "active" }),
    ],
    [
      "inventory.listProductStock (sin filtro)",
      () =>
        listProductStock(context, {
          text: "",
          stockStatus: "all",
          activity: "active",
          page: 1,
        }),
    ],
    [
      "inventory.listProductStock (página profunda)",
      () =>
        listProductStock(context, {
          text: "",
          stockStatus: "all",
          activity: "active",
          page: 20,
        }),
    ],
    [
      "crm.searchClients (sin texto)",
      () => searchClients(context, { text: "", activity: "all", page: 1 }),
    ],
    [
      "crm.searchClients (página profunda)",
      () => searchClients(context, { text: "", activity: "all", page: 100 }),
    ],
    [
      "crm.searchClients (prefijo de nombre)",
      () => searchClients(context, { text: "Ana", activity: "all", page: 1 }),
    ],
    [
      "conversations.listConversations",
      () =>
        listConversations(context, {
          from: "",
          to: "",
          status: "",
          channel: "",
          clientId: "",
          page: 1,
        }),
    ],
    [
      "conversations.searchClientsByLastInteraction",
      () =>
        searchClientsByLastInteraction(context, {
          text: "",
          activity: "all",
          page: 1,
        }),
    ],
    [
      "organizations.listMembers",
      () => listMembers(context, { role: "all", status: "all", page: 1 }),
    ],
  ];
  if (productoId) {
    listados.push([
      `inventory.listStockMovements (producto con ${movimientos})`,
      () =>
        listStockMovements(context, productoId, {
          type: "",
          from: "",
          to: "",
          page: 1,
        }),
    ]);
  }

  const metricas: [string, () => Promise<unknown>][] = [
    [
      "analytics 1 conversaciones iniciadas",
      () => getConversationsStarted(context, periodo),
    ],
    [
      "analytics 2 conversaciones activas",
      () => getActiveConversations(context, periodo),
    ],
    ["analytics 3 clientes únicos", () => getUniqueClients(context, periodo)],
    ["analytics 4-5 mensajes", () => getMessageCounts(context, periodo)],
    [
      "analytics 6 mensajes por conversación",
      () => getMessagesPerConversation(context, periodo),
    ],
    ["analytics 10 actividad diaria", () => getDailyActivity(context, periodo)],
    [
      "analytics 7 respondidas",
      () => getRespondedConversations(context, periodo),
    ],
    [
      "analytics 8 cobertura de respuesta",
      () => getResponseCoverage(context, periodo),
    ],
    [
      "analytics 9 tiempo de primera respuesta",
      () => getFirstResponseTime(context, periodo),
    ],
    [
      "analytics 11 distribución de estado",
      () => getStatusDistribution(context, periodo),
    ],
  ];

  console.log(`\n## Caminos completos — ${etiqueta}`);
  console.log(`Mediana de ${CORRIDAS} corridas, tras una de calentamiento.\n`);
  console.log("| Camino | Mediana | Mínimo | Máximo |");
  console.log("| --- | --- | --- | --- |");
  for (const [nombre, ejecutar] of [...listados, ...metricas]) {
    const r = await medir(nombre, ejecutar);
    console.log(
      `| ${r.nombre} | ${r.mediana.toFixed(1)} ms | ${r.minimo.toFixed(1)} ms | ${r.maximo.toFixed(1)} ms |`,
    );
  }

  // El dashboard pide las doce métricas por carga (brief-7.4). Medirlas sueltas no dice cuánto
  // tarda la pantalla: esto mide la carga entera, que es lo que ve quien la abre.
  const carga = await medir("pantalla 2 completa", async () => {
    await Promise.all(metricas.map(([, ejecutar]) => ejecutar()));
  });
  console.log(
    `\n**Dashboard, las métricas de una carga en paralelo**: mediana ${carga.mediana.toFixed(1)} ms ` +
      `(mínimo ${carga.minimo.toFixed(1)}, máximo ${carga.maximo.toFixed(1)}).`,
  );

  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
