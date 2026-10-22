import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login } from "@/modules/auth";
import {
  createModel,
  createProduct,
  createServiceProduct,
  type ProductInput,
} from "@/modules/catalog";
import { applyGradeTemplate, changeProductTracking } from "@/modules/inventory";
import {
  activateCapability,
  getAuthContext,
  getProfile,
  type AuthContext,
} from "@/modules/organizations";
import {
  applyRepairTypeTemplate,
  listRepairTypes,
  repairTypeIdsByName,
  setRepairPrice,
} from "@/modules/service";
import {
  applyChecklistTemplate,
  applyQuoteTemplate,
  getQuoteSettingsForm,
  getTradeInQuoteForm,
  listChecklistItems,
  listTradeInMargins,
  quoteTradeIn,
  setChecklistItemRepairType,
  setTradeInMargin,
  updateQuoteSettings,
  type QuoteSettingsInput,
  type TradeInQuoteInput,
} from "@/modules/tradeins";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// La cotización de un usado contra PostgreSQL real (brief-29.7.3, D-8): la regla con el precio de
// catalog y los costos de service; cada motivo de «no hay cotización» y cada rechazo por su nombre; que
// no escribe nada; los valores sueltos y los márgenes con su auditoría y sus CHECK; el tipo de
// reparación de un punto; el viewer; una organización sin trade_ins y una sin repairs.

const PASSWORD = "contraseña-correcta-larga";
const TEST_TIMEOUT = 30000;
let storedHash: string;

async function returningId(query: SQL): Promise<string> {
  const result = await getDb().execute<{ id: string }>(query);
  return result.rows[0]!.id;
}

async function count(query: SQL): Promise<number> {
  const result = await getDb().execute<{ count: number }>(query);
  return result.rows[0]!.count;
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`rechazado: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

async function member(
  orgId: string,
  email: string,
  role: "admin" | "viewer",
): Promise<{ context: AuthContext; userId: string }> {
  const userId = await returningId(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, ${email}, false) returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgId}, ${userId}, ${role})`,
  );
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error("login rechazado");
  const auth = await getAuthContext(logged.token);
  if (!auth.ok) throw new Error("contexto rechazado");
  return { context: auth.context, userId };
}

// Lo que hace org:capability --profile iphone, con la copia de la cotización (U-4). Con only, solo esas
// capacidades, sin plantillas.
async function activate(
  organizationId: string,
  adminEmail: string,
  only?: ("serialized_units" | "variants" | "trade_ins")[],
) {
  const profile = getProfile("iphone")!;
  await getDb().transaction(async (tx) => {
    let actorUserId = "";
    for (const capability of only ?? profile.capabilities) {
      const activated = await activateCapability(tx, {
        organizationId,
        capability,
        adminEmail,
      });
      if (!activated.ok) throw new Error(activated.code);
      actorUserId = activated.actorUserId;
    }
    if (only) return;
    await applyGradeTemplate(tx, {
      organizationId,
      actorUserId,
      grades: profile.grades,
    });
    await applyRepairTypeTemplate(tx, {
      organizationId,
      actorUserId,
      repairTypes: profile.repairTypes,
    });
    await createServiceProduct(tx, { organizationId, actorUserId });
    await applyChecklistTemplate(tx, {
      organizationId,
      actorUserId,
      items: profile.tradeInChecklist,
    });
    const quote = profile.tradeInQuote!;
    const typeIds = await repairTypeIdsByName(tx, organizationId);
    await applyQuoteTemplate(tx, {
      organizationId,
      actorUserId,
      template: {
        batteryThreshold: quote.batteryThreshold,
        rangePercent: quote.rangePercent,
        roundingStep: quote.roundingStep,
        roundingCurrency: quote.roundingCurrency,
        batteryRepairTypeId:
          typeIds.get(quote.batteryRepairType.toLowerCase()) ?? null,
        itemRepairTypes: new Map(
          profile.tradeInChecklist
            .filter((item) => item.repairType)
            .map((item) => [
              item.name.toLowerCase(),
              typeIds.get(item.repairType!.toLowerCase())!,
            ]),
        ),
      },
    });
  });
}

function productInput(
  sku: string,
  condition: ProductInput["condition"] = "used",
): ProductInput {
  return {
    sku,
    name: `iPhone ${sku}`,
    description: null,
    unit: "unidad",
    reorderPoint: "0",
    brand: null,
    category: null,
    condition,
    barcode: null,
    weightKg: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    location: null,
    shelf: null,
  };
}

// Un producto usado por unidad, con modelo y, si se pide, con precio.
async function usedProduct(
  admin: AuthContext,
  adminId: string,
  orgId: string,
  sku: string,
  modelId: string,
  price: string | null,
): Promise<string> {
  const product = ok(await createProduct(admin, productInput(sku)));
  ok(await changeProductTracking(admin, product.productId, "unit"));
  await getDb().execute(
    sql`update products set model_id = ${modelId} where id = ${product.productId}`,
  );
  if (price) {
    await getDb().execute(
      sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
          values (${orgId}, ${product.productId}, ${price}, 'USD', ${adminId})`,
    );
  }
  return product.productId;
}

async function seed() {
  const orgA = await returningId(
    sql`insert into organizations (name, main_currency) values ('iPhone A', 'USD') returning id`,
  );
  const orgB = await returningId(
    sql`insert into organizations (name, main_currency) values ('Sin usados', 'USD') returning id`,
  );
  const admin = await member(orgA, "admin-a@example.com", "admin");
  const viewer = await member(orgA, "viewer-a@example.com", "viewer");
  const adminB = await member(orgB, "admin-b@example.com", "admin");
  await activate(orgA, "admin-a@example.com");
  await activate(orgB, "admin-b@example.com", ["serialized_units"]);

  const model = ok(
    await createModel(admin.context, { name: "iPhone 13", brand: "Apple" }),
  );
  const bareModel = ok(
    await createModel(admin.context, { name: "iPhone 12", brand: "Apple" }),
  );
  const productId = await usedProduct(
    admin.context,
    admin.userId,
    orgA,
    "13U",
    model.modelId,
    "500.00",
  );
  const types = ok(await listRepairTypes(admin.context)).types;
  const type = (name: string) => types.find((one) => one.name === name)!.id;
  // Los costos del modelo: la batería, la cámara trasera y la pantalla; Face ID, sin costo.
  for (const [name, cost] of [
    ["Cambio de batería", "40"],
    ["Cámara trasera", "60"],
    ["Cambio de pantalla", "90,50"],
  ] as const) {
    ok(
      await setRepairPrice(admin.context, {
        repairTypeId: type(name),
        modelId: model.modelId,
        price: "100",
        priceCurrency: "USD",
        cost,
        costCurrency: "USD",
      }),
    );
  }
  ok(
    await setTradeInMargin(admin.context, {
      modelId: model.modelId,
      amount: "50",
      currency: "USD",
    }),
  );
  const items = ok(await listChecklistItems(admin.context)).items;
  const item = (name: string) => items.find((one) => one.name === name)!.id;

  return {
    orgA,
    orgB,
    admin: admin.context,
    adminId: admin.userId,
    viewer: viewer.context,
    adminB: adminB.context,
    modelId: model.modelId,
    bareModelId: bareModel.modelId,
    productId,
    type,
    items,
    item,
  };
}

type Seed = Awaited<ReturnType<typeof seed>>;

// Todo pasa, salvo los nombres de failing.
function input(
  s: Seed,
  overrides: Partial<TradeInQuoteInput> = {},
  failing: string[] = [],
): TradeInQuoteInput {
  return {
    productId: s.productId,
    batteryHealth: "90",
    passed: s.items
      .filter((one) => !failing.includes(one.name))
      .map((one) => one.id),
    ...overrides,
  };
}

function settingsInput(
  overrides: Partial<QuoteSettingsInput> = {},
): QuoteSettingsInput {
  return {
    batteryThreshold: "80",
    rangePercent: "10",
    roundingStep: "10",
    roundingCurrency: "USD",
    batteryRepairTypeId: "",
    ...overrides,
  };
}

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("la cotización (AC-1 y AC-2)", () => {
  it(
    "sin reparaciones: el precio menos el margen, con el rango y la marca de ejemplo",
    async () => {
      const s = await seed();
      const result = ok(await quoteTradeIn(s.admin, input(s)));
      expect(result.quote).toMatchObject({
        product: { id: s.productId, name: "iPhone 13U" },
        currency: "USD",
        reference: { amount: "500.00" },
        repairs: [],
        margin: "50.00",
        value: "450.00",
        low: "400.00",
        high: "450.00",
        rangePercent: "10.00",
        roundingStep: "10.00",
        usesExample: true,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "resta cada punto que falla con reparación y la batería bajo el umbral; un punto sin reparación no resta",
    async () => {
      const s = await seed();
      const result = ok(
        await quoteTradeIn(
          s.admin,
          input(s, { batteryHealth: "79" }, ["Cámara trasera", "Micrófono"]),
        ),
      );
      // 500 − 60 − 40 − 50 = 350; piso 315 → 310.
      expect(result.quote).toMatchObject({
        value: "350.00",
        low: "310.00",
        high: "350.00",
      });
      expect(result.quote.repairs).toEqual([
        {
          name: "Cámara trasera",
          cost: "60.00",
          because: ["Cámara trasera"],
          battery: false,
        },
        {
          name: "Cambio de batería",
          cost: "40.00",
          because: [],
          battery: true,
        },
      ]);
      // En el umbral, la batería no resta.
      const atThreshold = ok(
        await quoteTradeIn(s.admin, input(s, { batteryHealth: "80" })),
      );
      expect(atThreshold.quote.value).toBe("450.00");
    },
    TEST_TIMEOUT,
  );

  it(
    "un tipo que piden dos puntos se cuenta una vez, con los dos puntos",
    async () => {
      const s = await seed();
      ok(
        await setChecklistItemRepairType(
          s.admin,
          s.item("True Tone"),
          s.type("Cambio de pantalla"),
        ),
      );
      const result = ok(
        await quoteTradeIn(s.admin, input(s, {}, ["Táctil", "True Tone"])),
      );
      expect(result.quote.repairs).toEqual([
        {
          name: "Cambio de pantalla",
          cost: "90.50",
          because: ["True Tone", "Táctil"],
          battery: false,
        },
      ]);
      // 500 − 90,50 − 50 = 359,50 → 350; piso 323,55 → 320.
      expect(result.quote).toMatchObject({
        value: "359.50",
        low: "320.00",
        high: "350.00",
      });
    },
    TEST_TIMEOUT,
  );
});

describe("los rechazos y los motivos (AC-3)", () => {
  it(
    "un punto obligatorio que falla: no se recibe, nombrándolo",
    async () => {
      const s = await seed();
      expect(
        await quoteTradeIn(
          s.admin,
          input(s, {}, ["Toma señal", "iCloud desvinculado"]),
        ),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "mandatory_failed",
        items: ["Toma señal", "iCloud desvinculado"],
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "cada motivo de «no hay cotización» por su nombre",
    async () => {
      const s = await seed();
      const rule = async (quoteInput: TradeInQuoteInput) => {
        const result = await quoteTradeIn(s.admin, quoteInput);
        return result.ok || result.code !== "BUSINESS_RULE_VIOLATION"
          ? result
          : {
              rule: result.rule,
              ...("repairs" in result ? { repairs: result.repairs } : {}),
            };
      };
      // Face ID no tiene costo para el modelo.
      expect(await rule(input(s, {}, ["Face ID"]))).toEqual({
        rule: "no_repair_cost",
        repairs: ["Face ID"],
      });
      // Un producto sin precio y uno sin margen.
      const noPrice = await usedProduct(
        s.admin,
        s.adminId,
        s.orgA,
        "13SP",
        s.modelId,
        null,
      );
      expect(await rule(input(s, { productId: noPrice }))).toEqual({
        rule: "no_reference_price",
      });
      const noMargin = await usedProduct(
        s.admin,
        s.adminId,
        s.orgA,
        "12U",
        s.bareModelId,
        "300.00",
      );
      expect(await rule(input(s, { productId: noMargin }))).toEqual({
        rule: "no_margin",
      });
      // Un producto nuevo no se cotiza.
      const fresh = ok(
        await createProduct(s.admin, productInput("13N", "new")),
      );
      expect(await rule(input(s, { productId: fresh.productId }))).toEqual({
        rule: "product_not_quotable",
      });
      // El margen en otra moneda.
      ok(
        await setTradeInMargin(s.admin, {
          modelId: s.modelId,
          amount: "50000",
          currency: "ARS",
        }),
      );
      expect(await rule(input(s))).toEqual({ rule: "currency_mismatch" });
      // Un margen que se come el valor.
      ok(
        await setTradeInMargin(s.admin, {
          modelId: s.modelId,
          amount: "500",
          currency: "USD",
        }),
      );
      expect(await rule(input(s))).toEqual({ rule: "not_positive" });
      ok(
        await setTradeInMargin(s.admin, {
          modelId: s.modelId,
          amount: "50",
          currency: "USD",
        }),
      );
      // Sin reparación de la batería, con la batería bajo el umbral; con la batería bien, cotiza.
      ok(await updateQuoteSettings(s.admin, settingsInput()));
      expect(await rule(input(s, { batteryHealth: "50" }))).toEqual({
        rule: "no_battery_repair_type",
      });
      expect((await quoteTradeIn(s.admin, input(s))).ok).toBe(true);
      // Un producto que no existe, y la entrada inválida.
      expect(
        await quoteTradeIn(
          s.admin,
          input(s, { productId: "00000000-0000-4000-8000-000000000000" }),
        ),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
      expect(
        await quoteTradeIn(
          s.admin,
          input(s, { productId: "x", batteryHealth: "101" }),
        ),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["product", "batteryHealth"],
      });
    },
    TEST_TIMEOUT * 2,
  );

  it(
    "sin valores sueltos no hay cotización; los crea un admin desde la pantalla",
    async () => {
      const s = await seed();
      await getDb().execute(
        sql`delete from trade_in_settings where organization_id = ${s.orgA}`,
      );
      const result = await quoteTradeIn(s.admin, input(s));
      expect(result).toMatchObject({ ok: false, rule: "no_settings" });
      // La copia del perfil ya dejó su create; el admin suma el suyo, sin el origen del perfil.
      const creates = () =>
        count(
          sql`select count(*)::int as count from audit_logs
              where entity_type = 'trade_in_settings' and action = 'create'
                and organization_id = ${s.orgA} and actor_user_id = ${s.adminId}
                and not (diff->'after' ? 'origen')`,
        );
      expect(await creates()).toBe(0);
      expect(ok(await updateQuoteSettings(s.admin, settingsInput()))).toEqual({
        ok: true,
        changed: true,
      });
      expect(await creates()).toBe(1);
      expect((await quoteTradeIn(s.admin, input(s))).ok).toBe(true);
    },
    TEST_TIMEOUT,
  );
});

describe("la cotización no escribe nada (AC-4)", () => {
  it(
    "ni filas, ni auditoría, ni contadores",
    async () => {
      const s = await seed();
      const snapshot = () =>
        count(
          sql`select ((select count(*) from audit_logs) + (select count(*) from trade_ins)
                + (select count(*) from trade_in_settings) + (select count(*) from trade_in_margins)
                + (select count(*) from document_counters) + (select count(*) from stock_units)
                + (select coalesce(sum(extract(epoch from updated_at)), 0)::bigint from trade_in_settings)
              )::int as count`,
        );
      const before = await snapshot();
      ok(
        await quoteTradeIn(
          s.admin,
          input(s, { batteryHealth: "50" }, ["Cámara trasera"]),
        ),
      );
      await quoteTradeIn(s.admin, input(s, {}, ["Face ID"]));
      expect(await snapshot()).toBe(before);
    },
    TEST_TIMEOUT,
  );
});

describe("los valores sueltos y los márgenes (AC-5)", () => {
  it(
    "un admin edita los valores, con auditoría, y la marca de ejemplo se apaga",
    async () => {
      const s = await seed();
      const form = ok(await getQuoteSettingsForm(s.admin)).form;
      expect(form.settings).toMatchObject({
        batteryThreshold: 80,
        rangePercent: "10.00",
        roundingStep: "10.00",
        roundingCurrency: "USD",
        batteryRepairTypeId: s.type("Cambio de batería"),
        isExample: true,
      });
      expect(
        await updateQuoteSettings(
          s.admin,
          settingsInput({
            batteryThreshold: "85",
            rangePercent: "7,5",
            batteryRepairTypeId: s.type("Cambio de batería"),
          }),
        ),
      ).toEqual({ ok: true, changed: true });
      const after = ok(await getQuoteSettingsForm(s.admin)).form.settings;
      expect(after).toMatchObject({
        batteryThreshold: 85,
        rangePercent: "7.50",
        isExample: false,
      });
      const audit = await getDb().execute<{ diff: unknown }>(
        sql`select diff from audit_logs
            where entity_type = 'trade_in_settings' and action = 'update' and organization_id = ${s.orgA}`,
      );
      expect(audit.rows).toEqual([
        {
          diff: {
            before: {
              batteryThreshold: 80,
              rangePercent: "10.00",
              isExample: true,
            },
            after: {
              batteryThreshold: 85,
              rangePercent: "7.50",
              isExample: false,
            },
          },
        },
      ]);
      // Lo mismo otra vez no cambia nada.
      expect(
        await updateQuoteSettings(
          s.admin,
          settingsInput({
            batteryThreshold: "85",
            rangePercent: "7.50",
            batteryRepairTypeId: s.type("Cambio de batería"),
          }),
        ),
      ).toEqual({ ok: true, changed: false });
    },
    TEST_TIMEOUT,
  );

  it(
    "los valores inválidos se rechazan por su campo",
    async () => {
      const s = await seed();
      const fields = async (overrides: Partial<QuoteSettingsInput>) => {
        const result = await updateQuoteSettings(
          s.admin,
          settingsInput(overrides),
        );
        return !result.ok &&
          result.code === "VALIDATION_ERROR" &&
          "fields" in result
          ? result.fields
          : result;
      };
      expect(await fields({ batteryThreshold: "0" })).toEqual([
        "batteryThreshold",
      ]);
      expect(await fields({ batteryThreshold: "101" })).toEqual([
        "batteryThreshold",
      ]);
      expect(await fields({ rangePercent: "50,01" })).toEqual(["rangePercent"]);
      expect(await fields({ rangePercent: "-1" })).toEqual(["rangePercent"]);
      expect(await fields({ roundingStep: "0" })).toEqual(["roundingStep"]);
      expect(await fields({ roundingCurrency: "XXX" })).toEqual([
        "roundingCurrency",
      ]);
      expect(
        await fields({
          batteryRepairTypeId: "00000000-0000-4000-8000-000000000000",
        }),
      ).toEqual(["batteryRepairTypeId"]);
      // El rango puede ser 0 % y 50 %.
      expect(
        (
          await updateQuoteSettings(
            s.admin,
            settingsInput({ rangePercent: "0" }),
          )
        ).ok,
      ).toBe(true);
      expect(
        (
          await updateQuoteSettings(
            s.admin,
            settingsInput({ rangePercent: "50" }),
          )
        ).ok,
      ).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    "un margen se crea, se cambia y admite cero, con auditoría; nada se borra",
    async () => {
      const s = await seed();
      const margins = ok(await listTradeInMargins(s.admin)).margins;
      expect(margins).toEqual([
        expect.objectContaining({
          modelName: "iPhone 13",
          margin: { amount: "50.00", currency: "USD" },
        }),
        expect.objectContaining({ modelName: "iPhone 12", margin: null }),
      ]);
      expect(
        await setTradeInMargin(s.admin, {
          modelId: s.bareModelId,
          amount: "0",
          currency: "USD",
        }),
      ).toEqual({ ok: true, changed: true });
      expect(
        await setTradeInMargin(s.admin, {
          modelId: s.modelId,
          amount: "50",
          currency: "USD",
        }),
      ).toEqual({ ok: true, changed: false });
      expect(
        await setTradeInMargin(s.admin, {
          modelId: s.modelId,
          amount: "60,25",
          currency: "USD",
        }),
      ).toEqual({ ok: true, changed: true });
      const audit = await getDb().execute<{ action: string; diff: unknown }>(
        sql`select action, diff from audit_logs
            where entity_type = 'trade_in_margin' and organization_id = ${s.orgA}
            order by created_at, id`,
      );
      expect(audit.rows.map((row) => row.action)).toEqual([
        "create",
        "create",
        "update",
      ]);
      expect(audit.rows[2]!.diff).toEqual({
        before: { amount: "50.00", currency: "USD" },
        after: { amount: "60.25", currency: "USD" },
      });
      // Los rechazos.
      expect(
        await setTradeInMargin(s.admin, {
          modelId: s.modelId,
          amount: "-5",
          currency: "USD",
        }),
      ).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["amount"],
      });
      expect(
        await setTradeInMargin(s.admin, {
          modelId: s.modelId,
          amount: "5",
          currency: "XXX",
        }),
      ).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["currency"],
      });
      expect(
        await setTradeInMargin(s.admin, {
          modelId: "00000000-0000-4000-8000-000000000000",
          amount: "5",
          currency: "USD",
        }),
      ).toEqual({ ok: false, code: "NOT_FOUND" });
    },
    TEST_TIMEOUT,
  );
});

describe("el tipo de reparación de un punto (AC-6)", () => {
  it(
    "se fija, se cambia y se saca con auditoría; uno de otra organización no",
    async () => {
      const s = await seed();
      const micro = s.item("Micrófono");
      expect(
        await setChecklistItemRepairType(
          s.admin,
          micro,
          s.type("Pin de carga"),
        ),
      ).toEqual({ ok: true, itemId: micro, changed: true });
      expect(
        await setChecklistItemRepairType(
          s.admin,
          micro,
          s.type("Pin de carga"),
        ),
      ).toEqual({ ok: true, itemId: micro, changed: false });
      expect(await setChecklistItemRepairType(s.admin, micro, "")).toEqual({
        ok: true,
        itemId: micro,
        changed: true,
      });
      const audit = await getDb().execute<{ diff: unknown }>(
        sql`select diff from audit_logs
            where entity_type = 'trade_in_checklist_item' and entity_id = ${micro}
              and action = 'update'
            order by created_at, id`,
      );
      expect(audit.rows).toEqual([
        {
          diff: {
            before: { repairTypeId: null },
            after: { repairTypeId: s.type("Pin de carga") },
          },
        },
        {
          diff: {
            before: { repairTypeId: s.type("Pin de carga") },
            after: { repairTypeId: null },
          },
        },
      ]);
      // Un tipo de otra organización.
      const foreign = await returningId(
        sql`insert into repair_types (organization_id, name) values (${s.orgB}, 'Ajeno') returning id`,
      );
      expect(await setChecklistItemRepairType(s.admin, micro, foreign)).toEqual(
        {
          ok: false,
          code: "NOT_FOUND",
        },
      );
      await expect(
        getDb().execute(
          sql`update trade_in_checklist_items set repair_type_id = ${foreign} where id = ${micro}`,
        ),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );
});

describe("los roles y las capacidades (AC-8 y AC-10)", () => {
  it(
    "un viewer no cotiza ni configura",
    async () => {
      const s = await seed();
      const forbidden = { ok: false, code: "FORBIDDEN" };
      expect(await quoteTradeIn(s.viewer, input(s))).toEqual(forbidden);
      expect(await getTradeInQuoteForm(s.viewer)).toEqual(forbidden);
      expect(await getQuoteSettingsForm(s.viewer)).toEqual(forbidden);
      expect(await listTradeInMargins(s.viewer)).toEqual(forbidden);
      expect(await updateQuoteSettings(s.viewer, settingsInput())).toEqual(
        forbidden,
      );
      expect(
        await setTradeInMargin(s.viewer, {
          modelId: s.modelId,
          amount: "1",
          currency: "USD",
        }),
      ).toEqual(forbidden);
      expect(
        await setChecklistItemRepairType(s.viewer, s.item("Micrófono"), ""),
      ).toEqual(forbidden);
    },
    TEST_TIMEOUT,
  );

  it(
    "sin trade_ins, nada existe",
    async () => {
      const s = await seed();
      const notFound = { ok: false, code: "NOT_FOUND" };
      expect(await quoteTradeIn(s.adminB, input(s))).toEqual(notFound);
      expect(await getTradeInQuoteForm(s.adminB)).toEqual(notFound);
      expect(await getQuoteSettingsForm(s.adminB)).toEqual(notFound);
      expect(await listTradeInMargins(s.adminB)).toEqual(notFound);
      expect(await updateQuoteSettings(s.adminB, settingsInput())).toEqual(
        notFound,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "sin repairs, una reparación necesaria no tiene costo, y se nombra por su punto",
    async () => {
      const orgC = await returningId(
        sql`insert into organizations (name, main_currency) values ('Sin reparaciones', 'USD') returning id`,
      );
      const adminC = await member(orgC, "admin-c@example.com", "admin");
      await activate(orgC, "admin-c@example.com", [
        "variants",
        "serialized_units",
        "trade_ins",
      ]);
      const model = ok(
        await createModel(adminC.context, {
          name: "iPhone 11",
          brand: "Apple",
        }),
      );
      const productId = await usedProduct(
        adminC.context,
        adminC.userId,
        orgC,
        "11U",
        model.modelId,
        "200.00",
      );
      ok(
        await setTradeInMargin(adminC.context, {
          modelId: model.modelId,
          amount: "20",
          currency: "USD",
        }),
      );
      ok(await updateQuoteSettings(adminC.context, settingsInput()));
      // Un punto con un tipo cargado a mano: sin repairs no hay pantalla para elegirlo.
      const typeId = await returningId(
        sql`insert into repair_types (organization_id, name) values (${orgC}, 'Pantalla') returning id`,
      );
      const itemId = await returningId(
        sql`insert into trade_in_checklist_items (organization_id, name, repair_type_id)
            values (${orgC}, 'Táctil', ${typeId}) returning id`,
      );
      expect(
        await quoteTradeIn(adminC.context, {
          productId,
          batteryHealth: "90",
          passed: [],
        }),
      ).toEqual({
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "no_repair_cost",
        repairs: ["Táctil"],
      });
      // Pasando el punto, cotiza: 200 − 20 = 180.
      const quoted = ok(
        await quoteTradeIn(adminC.context, {
          productId,
          batteryHealth: "90",
          passed: [itemId],
        }),
      );
      expect(quoted.quote).toMatchObject({
        value: "180.00",
        usesExample: false,
      });
    },
    TEST_TIMEOUT,
  );
});
