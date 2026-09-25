import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  knowledgeListResponseSchema,
  productListResponseSchema,
} from "@/app/api/read/v1/contract";
import { handleKnowledgeList } from "@/app/api/read/v1/knowledge/handler";
import {
  handleProductDetail,
  handleProductSearch,
} from "@/app/api/read/v1/products/handler";
import { login } from "@/modules/auth";
import { createIngestionCredential } from "@/modules/ingestion";
import { createDb, getDb } from "@/shared/db";
import {
  expectedPilotCounts,
  PILOT_ENTRIES,
  PILOT_ORGANIZATION_ID,
  PILOT_PRODUCTS,
  PILOT_USERS,
  pilotEntryId,
  pilotProductId,
  seedPilot,
} from "../../seeds/pilot";
import { resetDatabase } from "./reset-database";
import { maintenanceUrl } from "./test-database";

// Seed del piloto contra PostgreSQL real (brief-11.4, AC-1): su forma, su idempotencia, que se
// niega a correr fuera de las bases permitidas, y que la API de lectura sobre esos datos no
// devuelve inactivos ni entradas no vigentes.

const PASSWORD = "contraseña-del-seed-larga";
const TEST_TIMEOUT = 60000;
const ORG = PILOT_ORGANIZATION_ID;

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  const result = await getDb().execute(query);
  return result.rows[0] as T;
}

// Una huella de cada tabla del piloto, fuera de `users`: su hash de contraseña lleva sal y
// cambia en cada corrida, a propósito (se repone como en el seed básico).
async function fingerprint(): Promise<Record<string, string>> {
  const tables = [
    "organizations",
    "organization_members",
    "products",
    "product_prices",
    "inventories",
    "inventory_movements",
    "knowledge_entries",
    "clients",
    "conversations",
    "messages",
  ];
  const result: Record<string, string> = {};
  // La organización y las membresías se reponen en cada corrida, así que su `updated_at` cambia a
  // propósito. Solo ahí se excluye; en las tablas con DO NOTHING la huella es la fila entera.
  const reposed = new Set(["organizations", "organization_members"]);
  for (const table of tables) {
    const column = table === "organizations" ? "id" : "organization_id";
    const row = reposed.has(table) ? "(to_jsonb(t) - 'updated_at')" : "t";
    const found = await one<{ digest: string | null }>(
      sql.raw(
        `select md5(string_agg(${row}::text, '|' order by t.id)) as digest
         from ${table} t where t.${column} = '${ORG}'`,
      ),
    );
    result[table] = found.digest ?? "";
  }
  return result;
}

const savedEnv = {
  enabled: process.env.READ_API_ENABLED,
  allowed: process.env.READ_API_ALLOWED_CREDENTIALS,
};

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterEach(() => {
  for (const [key, value] of [
    ["READ_API_ENABLED", savedEnv.enabled],
    ["READ_API_ALLOWED_CREDENTIALS", savedEnv.allowed],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("seed del piloto", { timeout: TEST_TIMEOUT }, () => {
  it("crea la forma aprobada en D-2", async () => {
    await seedPilot(getDb(), PASSWORD);
    const expected = expectedPilotCounts();

    // Los números de la resolución de D-2, escritos a mano: si la lista cambia, el caso falla
    // en vez de seguir a la lista.
    expect(expected).toMatchObject({
      products: 60,
      activeProducts: 55,
      refurbished: 20,
      productsWithPrice: 51,
      productsWithHistory: 10,
      entries: 15,
      clients: 30,
      conversations: 40,
    });

    const counts = await one<Record<string, number>>(
      sql`select
            (select count(*)::int from products where organization_id = ${ORG}) as products,
            (select count(*)::int from products where organization_id = ${ORG} and is_active) as "activeProducts",
            (select count(*)::int from products where organization_id = ${ORG} and condition = 'refurbished') as refurbished,
            (select count(*)::int from product_prices where organization_id = ${ORG}) as prices,
            (select count(distinct product_id)::int from product_prices where organization_id = ${ORG}) as "productsWithPrice",
            (select count(*)::int from (select product_id from product_prices where organization_id = ${ORG}
               group by product_id having count(*) > 1) h) as "productsWithHistory",
            (select count(*)::int from inventories where organization_id = ${ORG}) as balances,
            (select count(*)::int from inventory_movements where organization_id = ${ORG}) as movements,
            (select count(*)::int from knowledge_entries where organization_id = ${ORG}) as entries,
            (select count(*)::int from clients where organization_id = ${ORG}) as clients,
            (select count(*)::int from conversations where organization_id = ${ORG}) as conversations,
            (select count(*)::int from messages where organization_id = ${ORG}) as messages`,
    );
    expect(counts).toEqual(expected);

    // Seis categorías y ocho marcas, y reacondicionados en más de dos categorías.
    const spread = await one<Record<string, number>>(
      sql`select count(distinct category)::int as categories,
                 count(distinct brand)::int as brands,
                 count(distinct category) filter (where condition = 'refurbished')::int as "refurbishedCategories"
          from products where organization_id = ${ORG}`,
    );
    expect(spread).toEqual({
      categories: 6,
      brands: 8,
      refurbishedCategories: 6,
    });

    // Todos los precios en ARS, y ningún saldo distinto del último balance_after de su cadena.
    const drift = await one<{ currencies: string[]; mismatched: number }>(
      sql`select
            (select array_agg(distinct currency) from product_prices where organization_id = ${ORG}) as currencies,
            (select count(*)::int from inventories i
              where i.organization_id = ${ORG}
                and i.quantity_on_hand <> (select m.balance_after from inventory_movements m
                                           where m.product_id = i.product_id
                                           order by m.created_at desc limit 1)) as mismatched`,
    );
    expect(drift).toEqual({ currencies: ["ARS"], mismatched: 0 });

    for (const user of PILOT_USERS) {
      await expect(
        login({ email: user.email, password: PASSWORD, ip: null }),
      ).resolves.toMatchObject({ ok: true });
    }
  });

  it("da los tres estados de stock entre los productos activos", async () => {
    await seedPilot(getDb(), PASSWORD);
    const states = await getDb().execute<{ status: string; count: number }>(
      sql`select case
                   when coalesce(i.quantity_on_hand, 0) <= 0 then 'sin_stock'
                   when i.quantity_on_hand <= p.reorder_point then 'bajo_stock'
                   else 'disponible'
                 end as status,
                 count(*)::int as count
          from products p left join inventories i on i.product_id = p.id
          where p.organization_id = ${ORG} and p.is_active
          group by 1 order by 1`,
    );
    expect(states.rows.map((row) => row.status)).toEqual([
      "bajo_stock",
      "disponible",
      "sin_stock",
    ]);
    for (const row of states.rows) expect(row.count).toBeGreaterThan(0);
  });

  it("tiene una entrada programada, una vencida y una inactiva; el resto, vigentes", async () => {
    await seedPilot(getDb(), PASSWORD);
    const statuses = await getDb().execute<{ status: string; count: number }>(
      sql`select case
                   when not is_active then 'inactiva'
                   when valid_from > (now() at time zone o.timezone)::date then 'programada'
                   when valid_until < (now() at time zone o.timezone)::date then 'vencida'
                   else 'vigente'
                 end as status,
                 count(*)::int as count
          from knowledge_entries k join organizations o on o.id = k.organization_id
          where k.organization_id = ${ORG}
          group by 1 order by 1`,
    );
    expect(statuses.rows).toEqual([
      { status: "inactiva", count: 1 },
      { status: "programada", count: 1 },
      { status: "vencida", count: 1 },
      { status: "vigente", count: 12 },
    ]);
  });

  it("una segunda corrida no cambia nada, y no pisa lo que la persona editó", async () => {
    await seedPilot(getDb(), PASSWORD);
    await getDb().execute(
      sql`update knowledge_entries set content = 'Editado desde la pantalla 12'
          where id = ${pilotEntryId(0)}`,
    );
    const before = await fingerprint();

    // Otro día: si algo dependiera de la hora de la corrida, la huella cambiaría.
    await seedPilot(getDb(), PASSWORD, {
      now: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    expect(await fingerprint()).toEqual(before);
    const edited = await one<{ content: string }>(
      sql`select content from knowledge_entries where id = ${pilotEntryId(0)}`,
    );
    expect(edited.content).toBe("Editado desde la pantalla 12");
  });

  it("se niega a correr contra una base sin sufijo seedeable", async () => {
    const maintenance = createDb(maintenanceUrl(process.env.DATABASE_URL!));
    try {
      await expect(seedPilot(maintenance, PASSWORD)).rejects.toThrow(
        'no contra "postgres"',
      );
    } finally {
      await maintenance.$client.end();
    }
    expect(
      (
        await one<{ count: number }>(
          sql`select count(*)::int as count from organizations`,
        )
      ).count,
    ).toBe(0);
  });

  it("sobre estos datos, la API de lectura no devuelve inactivos ni entradas no vigentes", async () => {
    await seedPilot(getDb(), PASSWORD);
    const created = await createIngestionCredential(ORG, "piloto-11-4", "read");
    if (!created.ok) throw new Error("credencial inválida");
    process.env.READ_API_ENABLED = "true";
    process.env.READ_API_ALLOWED_CREDENTIALS = created.credentialId;
    const headers = { authorization: `Bearer ${created.token}` };
    const base = "http://localhost/api/read/v1";

    const inactive = new Set(
      PILOT_PRODUCTS.filter((p) => !p.isActive).map((p) =>
        pilotProductId(p.index),
      ),
    );
    for (const q of ["reacondicionado", "Celulares", "Novatek", "Pulso"]) {
      const response = await handleProductSearch(
        new Request(`${base}/products?q=${encodeURIComponent(q)}&limit=25`, {
          headers,
        }),
      );
      expect(response.status).toBe(200);
      const body = productListResponseSchema.parse(await response.json());
      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(inactive.has(item.product_id)).toBe(false);
      }
    }

    const firstInactive = [...inactive][0]!;
    const detail = await handleProductDetail(
      new Request(`${base}/products/${firstInactive}`, { headers }),
      firstInactive,
    );
    expect(detail.status).toBe(404);

    const list = await handleKnowledgeList(
      new Request(`${base}/knowledge?limit=50`, { headers }),
    );
    expect(list.status).toBe(200);
    const entries = knowledgeListResponseSchema.parse(await list.json());
    const notCurrent = [
      "Horario especial de fin de año",
      "Promoción de vuelta a clases",
      "Envíos en moto",
    ];
    expect(PILOT_ENTRIES.map((e) => e.title)).toEqual(
      expect.arrayContaining(notCurrent),
    );
    expect(entries.items).toHaveLength(12);
    for (const title of notCurrent) {
      expect(entries.items.map((item) => item.title)).not.toContain(title);
    }
  });
});
