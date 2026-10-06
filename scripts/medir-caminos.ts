// Mide el camino completo de los listados y del dashboard invocando los **servicios reales**
// (9.3, AC-6 y AC-9). Uso:
//
//   DATABASE_URL=… npx tsx scripts/medir-caminos.ts <organizationId> [etiqueta]
//
// Contra una base de medición, con un rol propio: nunca contra la base de un entorno con datos.
//
// Por qué está versionado, a diferencia del de la 8.5: aquel vivió en el scratchpad y se perdió,
// así que su tanda no se podía repetir y la 9.3 tuvo que reconstruirla. Un número que no se puede
// volver a medir no es una línea de base, es una anécdota.
//
// Por qué llama a los servicios y no a SQL escrito a mano: una consulta reescrita para el
// `EXPLAIN` se parece a la de la aplicación pero no es la misma, y entonces el plan medido
// tampoco. Acá corre el mismo código que la pantalla. El SQL exacto y su plan salen del modo
// de planes (`CRM_PLANES`), que los recibe como avisos en esta conexión. En la 9.3 se obtenían
// encendiendo `log_min_duration_statement` en el rol: desde la 13.2 eso no se hace, porque deja
// las sentencias con sus parámetros en el log del servidor.
//
// Lo que este script NO mide: concurrencia. Corre una llamada por vez.
//
// Desde la 13.2 (brief-13.2, AC-4 a AC-6) tiene tres modos, que se eligen con variables de entorno:
//
//   (sin nada)            los tiempos de todos los caminos, como siempre;
//   CRM_TANDA=8.5         solo los caminos que ya existían en la 8.5 y la 9.3, para calibrar el
//                         umbral contra una organización sembrada sin referencias del emisor;
//   CRM_PLANES=<archivo>  en vez de tiempos, el plan de cada consulta que emite cada camino.
//
// Los planes no salen de una copia de la consulta: `auto_explain` los toma de la sentencia que
// la aplicación ejecuta, con `ANALYZE` y `BUFFERS`, y los devuelve a esta conexión como avisos
// (`auto_explain.log_level = notice`). No se escriben en el log del servidor, que filtra por
// `log_min_messages`. Requisitos: que el rol pueda cargar la biblioteca (superusuario, o
// `session_preload_libraries` fijado en el rol) y fijar sus parámetros. **Un camino que corre sin
// dejar ningún plan hace fallar la corrida**: es lo que pasa si la biblioteca no está cargada.
// Los tiempos y los planes van en corridas separadas porque `ANALYZE` encarece cada consulta.
//
// Al terminar, en cualquier modo, comprueba que ninguna conexión del pool quedó con una sentencia
// preparada con nombre y que `plan_cache_mode` es `auto` (AC-1).
//
// Las rutas de la API de lectura (brief-11.3, D-10) se miden por las lecturas de servicio que
// llama cada una, con el mismo texto y el mismo límite. No miden el borde: ni la credencial, ni la
// ventana del límite de tasa, ni el log.

import { existsSync, writeFileSync } from "node:fs";
import { sql, TransactionRollbackError } from "drizzle-orm";
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
  listRecentMessagesForService,
  resolveIngestedConversation,
  searchClientsByLastInteraction,
} from "@/modules/conversations";
import { searchClients } from "@/modules/crm";
import {
  getCatalogProductForService,
  listProductStock,
  listStockMovements,
  searchCatalogForService,
} from "@/modules/inventory";
import { listCurrentEntriesForService } from "@/modules/knowledge";
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
  // Las lecturas de servicio de la API devuelven la lista sola.
  if (Array.isArray(resultado)) return `${resultado.length} filas`;
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
    "messages",
    "rows",
  ]) {
    const valor = r[clave];
    if (Array.isArray(valor)) {
      const total = typeof r.total === "number" ? `/${r.total}` : "";
      return `${valor.length}${total} filas`;
    }
  }
  // La resolución de la conversación vigente (12.2) dice si usó una o abrió otra.
  if (typeof r.created === "boolean") {
    return r.created ? "conversación nueva" : "conversación vigente";
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

// La última página de un listado, **calculada**: pide la primera, lee de ahí cuántas páginas hay
// y pide esa. La 9.3 informó como «paginación profunda» la página 100 de 400 (R-6 de su revisión):
// un número de página escrito a mano deja de ser el peor caso apenas cambia el tamaño.
function ultimaPagina(
  pedir: (page: number) => Promise<unknown>,
): () => Promise<unknown> {
  let ultima: number | undefined;
  return async () => {
    if (ultima === undefined) {
      const primera = await pedir(1);
      const paginas = (primera as { pageCount?: unknown } | null)?.pageCount;
      // Sin `pageCount` no se sabe cuál es la última: se devuelve lo que vino, que `describir`
      // informa como falla o como sin forma.
      if (typeof paginas !== "number") return primera;
      ultima = paginas;
    }
    return pedir(ultima);
  };
}

// Enciende `auto_explain` en cada conexión nueva del pool y junta los planes que llegan como
// avisos. Devuelve cómo leer y vaciar lo juntado.
function capturarPlanes(
  pool: ReturnType<typeof getDb>["$client"],
  encender: boolean,
): () => string[] {
  let juntados: string[] = [];
  pool.on("connect", (client) => {
    client.on("notice", (aviso) => {
      if (aviso.message?.includes("plan:")) juntados.push(aviso.message);
    });
    if (!encender) return;
    const fallar = (error: unknown) => {
      console.error(
        `No se pudo encender auto_explain: ${error instanceof Error ? error.message : String(error)}`,
      );
    };
    // Se encolan antes que la primera consulta del camino, porque el pool entrega la conexión
    // después de emitir `connect`. `load` falla sin privilegios si el rol no la trae precargada:
    // se intenta y se sigue, y si no quedó cargada ningún camino deja planes.
    client.query("load 'auto_explain'").catch(() => {});
    client
      .query(
        `set auto_explain.log_min_duration = 0;
         set auto_explain.log_analyze = on;
         set auto_explain.log_buffers = on;
         set auto_explain.log_timing = on;
         set auto_explain.log_level = notice;
         set client_min_messages = notice`,
      )
      .catch(fallar);
  });
  return () => {
    const salida = juntados;
    juntados = [];
    return salida;
  };
}

// Las sentencias preparadas con nombre de todas las conexiones del pool, tomadas a la vez para
// no mirar dos veces la misma (AC-1).
async function sentenciasPreparadas(
  pool: ReturnType<typeof getDb>["$client"],
): Promise<{ conexiones: number; nombres: string[] }> {
  const clientes = await Promise.all(
    Array.from({ length: Math.max(1, pool.totalCount) }, () => pool.connect()),
  );
  try {
    const porConexion = await Promise.all(
      clientes.map((cliente) =>
        cliente.query<{ name: string }>(
          "select name from pg_prepared_statements order by name",
        ),
      ),
    );
    return {
      conexiones: clientes.length,
      nombres: porConexion.flatMap((r) => r.rows.map((row) => row.name)),
    };
  } finally {
    for (const cliente of clientes) cliente.release();
  }
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

  const archivoPlanes = process.env.CRM_PLANES;
  const modoPlanes = archivoPlanes !== undefined && archivoPlanes !== "";
  const tandaHistorica = process.env.CRM_TANDA === "8.5";
  // Control negativo de los planes (CRM_CONTROL=sin-planes): no enciende `auto_explain`. Si con
  // él la corrida de planes sale con 0, un camino sin plan puede pasar por medido (AC-6).
  const leerPlanes = capturarPlanes(
    db.$client,
    modoPlanes && process.env.CRM_CONTROL !== "sin-planes",
  );

  // El admin de la organización, que es quien ve todo: medir con `viewer` daría otros caminos
  // —el teléfono sale enmascarado— y no es el caso más caro.
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
  // La última página de cada listado paginado (13.2, AC-4; R-6 de la revisión de la 9.3). Las
  // dos «páginas profundas» de arriba quedan como estaban, para comparar con la 9.3.
  listados.push(
    [
      "inventory.listProductStock (última página)",
      ultimaPagina((page) =>
        listProductStock(context, {
          text: "",
          stockStatus: "all",
          activity: "active",
          page,
        }),
      ),
    ],
    [
      "crm.searchClients (última página)",
      ultimaPagina((page) =>
        searchClients(context, { text: "", activity: "all", page }),
      ),
    ],
    [
      "conversations.listConversations (última página)",
      ultimaPagina((page) =>
        listConversations(context, {
          from: "",
          to: "",
          status: "all",
          channel: "all",
          clientId: "",
          page,
        }),
      ),
    ],
    [
      "conversations.searchClientsByLastInteraction (última página)",
      ultimaPagina((page) =>
        searchClientsByLastInteraction(context, {
          text: "",
          activity: "all",
          page,
        }),
      ),
    ],
    [
      "organizations.listMembers (última página)",
      ultimaPagina((page) =>
        listMembers(context, { role: "all", status: "all", page }),
      ),
    ],
  );
  // Los órdenes y las filas por página de la brief-15.2 (D-7). Sin orden, los caminos de arriba
  // ya miden el de siempre.
  const sinFiltroDeConversaciones = {
    from: "",
    to: "",
    status: "all",
    channel: "all",
    clientId: "",
  };
  listados.push(
    [
      "inventory.listProductStock (por precio, 15.2)",
      () =>
        listProductStock(context, {
          text: "",
          stockStatus: "all",
          activity: "active",
          page: 1,
          sort: "price_desc",
        }),
    ],
    [
      "inventory.listProductStock (por stock, 50 filas, 15.2)",
      () =>
        listProductStock(context, {
          text: "",
          stockStatus: "all",
          activity: "active",
          page: 1,
          sort: "stock_asc",
          pageSize: 50,
        }),
    ],
    [
      "conversations.listConversations (más antiguo, 15.2)",
      () =>
        listConversations(context, {
          ...sinFiltroDeConversaciones,
          page: 1,
          sort: "oldest",
        }),
    ],
    [
      "conversations.listConversations (más antiguo, última página, 15.2)",
      ultimaPagina((page) =>
        listConversations(context, {
          ...sinFiltroDeConversaciones,
          page,
          sort: "oldest",
        }),
      ),
    ],
    [
      "conversations.listConversations (por inicio, 15.2)",
      () =>
        listConversations(context, {
          ...sinFiltroDeConversaciones,
          page: 1,
          sort: "started",
        }),
    ],
    [
      "conversations.listConversations (por inicio, última página, 15.2)",
      ultimaPagina((page) =>
        listConversations(context, {
          ...sinFiltroDeConversaciones,
          page,
          sort: "started",
        }),
      ),
    ],
    [
      "conversations.listConversations (50 filas, 15.2)",
      () =>
        listConversations(context, {
          ...sinFiltroDeConversaciones,
          page: 1,
          pageSize: 50,
        }),
    ],
    [
      "conversations.searchClientsByLastInteraction (nombre inverso, 15.2)",
      () =>
        searchClientsByLastInteraction(context, {
          text: "",
          activity: "all",
          page: 1,
          sort: "name_desc",
        }),
    ],
  );
  if (productoId) {
    listados.push([
      `inventory.listStockMovements (producto con ${movimientos}, última página)`,
      ultimaPagina((page) =>
        listStockMovements(context, productoId, {
          type: "all",
          from: "",
          to: "",
          page,
        }),
      ),
    ]);
  }
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

  // La API de lectura, con los límites por defecto del contrato (10 y 20). El detalle devuelve
  // null si el producto no existe o está inactivo: se lo cuenta como falla, porque no midió una
  // lectura.
  const activo = await db.execute<{ id: string }>(
    sql`select id from products
         where organization_id = ${organizationId} and is_active
         order by id limit 1`,
  );
  const activoId = activo.rows[0]?.id;
  listados.push(
    [
      "API products: palabras («cafe molido»)",
      () =>
        searchCatalogForService(organizationId, {
          text: "cafe molido",
          limit: 10,
        }),
    ],
    [
      "API products: SKU exacto",
      () =>
        searchCatalogForService(organizationId, {
          text: "SKU-000001",
          limit: 10,
        }),
    ],
    [
      "API products: sin coincidencias",
      () =>
        searchCatalogForService(organizationId, {
          text: "inexistente",
          limit: 10,
        }),
    ],
    [
      "API products/{product_id}",
      async () => {
        if (!activoId) return null;
        const found = await getCatalogProductForService(
          organizationId,
          activoId,
        );
        return found ? [found] : null;
      },
    ],
    [
      "API knowledge: vigentes sin texto",
      () =>
        listCurrentEntriesForService(organizationId, { text: null, limit: 20 }),
    ],
    [
      "API knowledge: vigentes con texto",
      () =>
        listCurrentEntriesForService(organizationId, {
          text: "horario",
          limit: 20,
        }),
    ],
  );

  // La Fase 12 (13.2, AC-5): la resolución de la conversación vigente (12.2) y el historial de
  // una conversación (12.4). Necesitan conversaciones con referencia del emisor, que el seed
  // histórico no tiene: la tanda de calibración las saltea, y lo dice.
  if (tandaHistorica) {
    console.log(
      "\nTanda 8.5 (CRM_TANDA): no se miden la conversación vigente ni el historial.",
    );
  } else {
    // La conversación con más mensajes: el caso desfavorable del historial (12.4, H-3).
    const mayor = await db.execute<{ external_ref: string; n: number }>(
      sql`select c.external_ref, count(m.id)::int as n
            from conversations c
            join messages m
              on m.organization_id = c.organization_id and m.conversation_id = c.id
           where c.organization_id = ${organizationId}
             and c.channel = 'whatsapp' and c.external_ref is not null
           group by c.id order by n desc, c.id limit 1`,
    );
    const totalMensajes = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from messages where organization_id = ${organizationId}`,
    );
    // Un cliente con teléfono y una conversación abierta o pendiente: el último mensaje de esa
    // conversación da la hora del mensaje nuevo, así la vigencia no depende del día en que corre
    // el script.
    const conVigente = await db.execute<{
      phone_e164: string;
      last_message_at: string;
    }>(
      sql`select cl.phone_e164,
                 to_char(c.last_message_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                   as last_message_at
            from conversations c
            join clients cl
              on cl.organization_id = c.organization_id and cl.id = c.client_id
           where c.organization_id = ${organizationId}
             and c.channel = 'whatsapp' and c.external_ref is not null
             and c.status in ('open', 'pending') and cl.phone_e164 is not null
           order by c.last_message_at desc, c.id limit 1`,
    );
    const referencia = mayor.rows[0];
    const vigente = conVigente.rows[0];
    const sinDatos = async () => ({
      ok: false,
      code: "SIN_CONVERSACIONES_CON_REFERENCIA",
    });

    // La resolución escribe: se corre dentro de una transacción que se deshace, así cada corrida
    // parte del mismo estado y la base queda como estaba.
    // `esperaNueva` es lo que el caso dice medir. Si la resolución hace lo otro, el tiempo es el
    // de otro camino y se informa como falla, no como medición.
    const resolver = (minutos: number, esperaNueva: boolean) => async () => {
      if (!vigente) return sinDatos();
      const sentAt = new Date(
        new Date(vigente.last_message_at).getTime() + minutos * 60_000,
      );
      let resultado: unknown;
      try {
        await db.transaction(async (tx) => {
          resultado = await resolveIngestedConversation(tx, {
            organizationId,
            clientPhone: vigente.phone_e164,
            channel: "whatsapp",
            proposedExternalRef: "medicion-13-2-propuesta",
            message: {
              externalRef: "medicion-13-2-mensaje",
              sentAt,
              bodyText: "Mensaje de la medición",
              kind: null,
            },
          });
          tx.rollback();
        });
      } catch (error) {
        if (!(error instanceof TransactionRollbackError)) throw error;
      }
      const creada = (resultado as { created?: unknown } | undefined)?.created;
      if (typeof creada === "boolean" && creada !== esperaNueva) {
        return { ok: false, code: "VIGENCIA_INESPERADA" };
      }
      return resultado;
    };

    listados.push(
      [
        "conversations.resolveIngestedConversation (con vigente)",
        resolver(1, false),
      ],
      [
        // Un mes después del último mensaje no queda ninguna candidata: abre una conversación.
        "conversations.resolveIngestedConversation (sin vigente)",
        resolver(30 * 24 * 60, true),
      ],
      [
        `conversations.listRecentMessagesForService (20 de ${referencia?.n ?? 0}, de ${totalMensajes.rows[0]?.n ?? 0} de la organización)`,
        () =>
          referencia
            ? listRecentMessagesForService(organizationId, {
                channel: "whatsapp",
                conversationRef: referencia.external_ref,
                limit: 20,
              })
            : sinDatos(),
      ],
      [
        "conversations.listRecentMessagesForService (50, el máximo del contrato)",
        () =>
          referencia
            ? listRecentMessagesForService(organizationId, {
                channel: "whatsapp",
                conversationRef: referencia.external_ref,
                limit: 50,
              })
            : sinDatos(),
      ],
    );
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

  // Los parámetros de costo, junto a lo que se mida (13.2, AC-16): un plan sin ellos no se puede
  // comparar con el de otra máquina.
  const parametros = await db.execute<{ name: string; valor: string }>(
    sql`select name, setting || coalesce(' ' || unit, '') as valor from pg_settings
         where name in ('effective_cache_size', 'random_page_cost', 'seq_page_cost',
                        'shared_buffers', 'work_mem', 'plan_cache_mode', 'server_version')
         order by name`,
  );
  console.log(
    `\nParámetros: ${parametros.rows.map((r) => `${r.name} = ${r.valor}`).join("; ")}.`,
  );

  if (modoPlanes) {
    // Un camino por vez, una sola corrida, y lo que `auto_explain` devolvió mientras corría.
    const bloques: string[] = [
      `# Planes — ${etiqueta}`,
      "",
      `Parámetros: ${parametros.rows.map((r) => `${r.name} = ${r.valor}`).join("; ")}.`,
    ];
    const sinPlan: string[] = [];
    const fallidos: string[] = [];
    console.log(`\n## Planes — ${etiqueta}\n`);
    console.log("| Camino | Consultas con plan | Resultado |");
    console.log("| --- | --- | --- |");
    for (const [nombre, ejecutar] of [...listados, ...metricas]) {
      // La llamada de `ultimaPagina` que averigua cuántas páginas hay también deja sus planes:
      // se corre una vez antes y se descartan, para que queden solo los de la página pedida.
      if (nombre.includes("última página")) await ejecutar();
      leerPlanes();
      const resultado = describir(await ejecutar());
      const planes = leerPlanes();
      if (esFalla(resultado)) fallidos.push(`${nombre}: ${resultado}`);
      if (planes.length === 0) sinPlan.push(nombre);
      console.log(`| ${nombre} | ${planes.length} | ${resultado} |`);
      bloques.push("", `## ${nombre}`, "", `Resultado: ${resultado}.`);
      planes.forEach((plan, i) => {
        bloques.push(
          "",
          `### Consulta ${i + 1} de ${planes.length}`,
          "",
          "```text",
          plan,
          "```",
        );
      });
    }
    writeFileSync(archivoPlanes, `${bloques.join("\n")}\n`);
    console.log(`\nPlanes escritos en ${archivoPlanes}.`);
    if (sinPlan.length > 0 || fallidos.length > 0) {
      console.log(
        `\n**${sinPlan.length} caminos sin ningún plan y ${fallidos.length} fallidos**: la corrida no vale.`,
      );
      for (const nombre of sinPlan) console.log(`- sin plan: ${nombre}`);
      for (const falla of fallidos) console.log(`- ${falla}`);
      process.exitCode = 1;
    }
    await comprobarPreparadas(db);
    await db.$client.end();
    return;
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

  await comprobarPreparadas(db);
  await db.$client.end();
}

// AC-1 de la 13.2: después de correr los caminos, ninguna conexión tiene una sentencia preparada
// con nombre, y el modo de plan es el de fábrica, también en los roles y en la base.
async function comprobarPreparadas(
  db: ReturnType<typeof getDb>,
): Promise<void> {
  const preparadas = await sentenciasPreparadas(db.$client);
  const modo = await db.execute<{ plan_cache_mode: string }>(
    sql`show plan_cache_mode`,
  );
  const fijados = await db.execute<{ donde: string }>(
    sql`select coalesce(r.rolname, '(todos)') || ' en ' || coalesce(d.datname, '(todas)')
                || ': ' || array_to_string(s.setconfig, ', ') as donde
           from pg_db_role_setting s
           left join pg_roles r on r.oid = s.setrole
           left join pg_database d on d.oid = s.setdatabase
          where array_to_string(s.setconfig, ',') like '%plan_cache_mode%'`,
  );
  console.log(
    `\n**Sentencias preparadas con nombre**: ${preparadas.nombres.length} en ${preparadas.conexiones} conexiones del pool` +
      `${preparadas.nombres.length > 0 ? ` (${preparadas.nombres.join(", ")})` : ""}. ` +
      `\`plan_cache_mode\` = ${modo.rows[0]?.plan_cache_mode}; fijado por rol o base: ` +
      `${fijados.rows.length === 0 ? "en ninguno" : fijados.rows.map((r) => r.donde).join("; ")}.`,
  );
  if (
    preparadas.nombres.length > 0 ||
    modo.rows[0]?.plan_cache_mode !== "auto" ||
    fijados.rows.length > 0
  ) {
    console.log(
      "**Los planes medidos pueden no ser los que corren**: ver O-2.",
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
