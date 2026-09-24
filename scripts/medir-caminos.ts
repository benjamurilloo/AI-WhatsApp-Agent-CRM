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
  getIngestionErrors,
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

// Describe lo que devolvió una llamada, para que **un camino que no corrió no pueda pasar por
// un camino rápido**. La primera corrida de este script dio 0,4 ms en `listConversations` y un
// tiempo menor que el de desarrollo en `listStockMovements`: las dos llamadas estaban fallando
// la validación de filtros y volviendo sin tocar la base. Un `Failure` devuelto en microsegundos
// es indistinguible de una consulta veloz si solo se mira el reloj.
function describir(resultado: unknown): string {
  if (resultado === null || typeof resultado !== "object") return "sin forma";
  const r = resultado as Record<string, unknown>;
  if (r.ok === false) {
    const codigo = typeof r.code === "string" ? r.code : "?";
    const campos = Array.isArray(r.fields) ? ` ${r.fields.join(",")}` : "";
    return `FALLA ${codigo}${campos}`;
  }
  for (const clave of [
    "products",
    "clients",
    "conversations",
    "members",
    "movements",
    "rows",
  ]) {
    const valor = r[clave];
    if (Array.isArray(valor)) {
      const total = typeof r.total === "number" ? `/${r.total}` : "";
      return `${valor.length}${total} filas`;
    }
  }
  if ("value" in r) return `valor ${JSON.stringify(r.value)}`.slice(0, 40);
  return "ok";
}

function esFalla(descripcion: string): boolean {
  return descripcion.startsWith("FALLA") || descripcion === "sin forma";
}

async function medir(
  nombre: string,
  ejecutar: () => Promise<unknown>,
): Promise<{
  nombre: string;
  mediana: number;
  minimo: number;
  maximo: number;
  resultado: string;
  valores: unknown[];
}> {
  // Una corrida de calentamiento que no cuenta: la primera paga la compilación del plan y la
  // lectura fría de las páginas, y mezclarla con las demás inventa una dispersión que no existe.
  const primera = await ejecutar();
  // Se guarda lo que devuelve **cada** corrida, no solo la de calentamiento: un `Failure` que
  // aparece en una corrida medida entraría a la mediana como si fuera una medición (M-2 de la
  // revisión independiente de la 11.0).
  const valores: unknown[] = [primera];
  const tiempos: number[] = [];
  for (let i = 0; i < CORRIDAS; i++) {
    const desde = performance.now();
    valores.push(await ejecutar());
    tiempos.push(performance.now() - desde);
  }
  return {
    nombre,
    mediana: mediana(tiempos),
    minimo: Math.min(...tiempos),
    maximo: Math.max(...tiempos),
    resultado: valores.map(describir).find(esFalla) ?? describir(primera),
    valores,
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

  // Control negativo (CRM_CONTROL=1): un período imposible hace que todas las métricas devuelvan
  // un `Failure`. Si con él la tabla no muestra fallas y el script sale con 0, el verde del modo
  // normal no vale nada (11.0, AC-4).
  const periodo =
    process.env.CRM_CONTROL === "1"
      ? { from: "2026-13-45", to: "" }
      : { from: "", to: "" };
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
          status: "all",
          channel: "all",
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
          type: "all",
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
    // La métrica 12 faltaba: la 9.3 informó «el dashboard de doce métricas» midiendo diez llamadas
    // (R-1 de la revisión de la 9.3). Con las métricas 4 y 5 en una sola llamada, son once.
    [
      "analytics 12 errores de ingestión",
      () => getIngestionErrors(context, periodo),
    ],
  ];

  // Control intermitente (CRM_CONTROL=intermitente): la métrica 1 responde bien la primera vez y
  // devuelve un `Failure` desde la segunda, que es la corrida de calentamiento contra las medidas.
  // Si con él el script sale con 0, vuelve a mirar solo el calentamiento (M-2).
  if (process.env.CRM_CONTROL === "intermitente") {
    const [nombre, ejecutar] = metricas[0]!;
    let llamadas = 0;
    metricas[0] = [
      nombre,
      async () =>
        ++llamadas === 1
          ? ejecutar()
          : { ok: false, code: "CONTROL_INTERMITENTE" },
    ];
  }

  console.log(`\n## Caminos completos — ${etiqueta}`);
  console.log(`Mediana de ${CORRIDAS} corridas, tras una de calentamiento.\n`);
  console.log("| Camino | Mediana | Mínimo | Máximo | Resultado |");
  console.log("| --- | --- | --- | --- | --- |");
  const fallas: string[] = [];
  for (const [nombre, ejecutar] of [...listados, ...metricas]) {
    const r = await medir(nombre, ejecutar);
    r.valores.forEach((valor, corrida) => {
      const descripcion = describir(valor);
      if (esFalla(descripcion)) {
        fallas.push(`${r.nombre}, corrida ${corrida}: ${descripcion}`);
      }
    });
    console.log(
      `| ${r.nombre} | ${r.mediana.toFixed(1)} ms | ${r.minimo.toFixed(1)} ms | ${r.maximo.toFixed(1)} ms | ${r.resultado} |`,
    );
  }

  // El dashboard pide las doce métricas por carga (brief-7.4). Medirlas sueltas no dice cuánto
  // tarda la pantalla: esto mide la carga entera, que es lo que ve quien la abre.
  //
  // Lo que devuelve `Promise.all` se mira: la versión de la 9.3 lo descartaba, así que una carga
  // en la que todas las métricas fallaban en microsegundos pasaba por una carga rápida (R-9 de la
  // revisión de la 9.3), en todas las corridas y no solo en la de calentamiento (M-2).
  const carga = await medir("pantalla 2 completa", async () => {
    const resultados = await Promise.all(
      metricas.map(([, ejecutar]) => ejecutar()),
    );
    return resultados.map((r, i) => [metricas[i]![0], describir(r)] as const);
  });
  console.log(
    `\n**Dashboard, las ${metricas.length} llamadas de una carga en paralelo**: mediana ${carga.mediana.toFixed(1)} ms ` +
      `(mínimo ${carga.minimo.toFixed(1)}, máximo ${carga.maximo.toFixed(1)}).`,
  );
  carga.valores.forEach((valor, corrida) => {
    for (const [nombre, resultado] of valor as (readonly [string, string])[]) {
      if (esFalla(resultado)) {
        fallas.push(
          `carga del dashboard, corrida ${corrida}, ${nombre}: ${resultado}`,
        );
      }
    }
  });

  if (fallas.length > 0) {
    console.log(
      `\n**${fallas.length} corridas fallaron**: su tiempo no es una medición.`,
    );
    for (const falla of fallas) console.log(`- ${falla}`);
    process.exitCode = 1;
  }

  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
