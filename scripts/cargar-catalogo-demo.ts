import { existsSync } from "node:fs";
import {
  createModel,
  createProduct,
  getCurrentPrices,
  listAttributes,
  listModels,
  searchProducts,
  setProductPrice,
} from "@/modules/catalog";
import { getAdminContextForScript } from "@/modules/organizations";
import { getDb } from "@/shared/db";
import {
  DEMO_IPHONE_BRAND,
  DEMO_IPHONE_CATALOG,
  DEMO_IPHONE_CATEGORY,
  demoProduct,
} from "../seeds/demo-iphone";

// Carga el catálogo de ejemplo de una tienda de iPhone en una organización (brief-29.2, D-9): unos
// doce modelos y unos cuarenta productos nuevos y reacondicionados, con capacidad, color y un precio
// de ejemplo en USD. Es para la organización demo «iPhone Demo», que se le muestra a un negocio del
// rubro; no es para el catálogo de un negocio real.
//   npm run demo:catalog -- --organization <id> --admin-email <correo>
// Usa los servicios de catalog, como la pantalla: las mismas validaciones, la regla del duplicado y
// la auditoría, a nombre del admin nombrado. Se niega si la organización no tiene la capacidad
// variants con el perfil de iPhone. El correo también puede llegar por CAPACIDAD_ADMIN_CORREO.
//
// Cada modelo, producto y precio es una transacción propia, como en la pantalla, así que una falla a
// mitad de la carga deja una parte cargada, y nada se borra. Por eso el script retoma: si todo lo que
// la organización ya tiene es de este catálogo, reusa los modelos, saltea los productos que existen
// y fija el precio de los que quedaron sin él. Si tiene cualquier otro modelo o producto, se niega
// sin cargar nada (revisión independiente de la 29.2, H-4). No se corre dos veces a la vez: la
// segunda chocaría con los SKU de la primera y habría que volver a correrlo.

const usage =
  "Uso: npm run demo:catalog -- --organization <id> --admin-email <correo>";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  const organizationId = option(args, "--organization");
  const adminEmail =
    option(args, "--admin-email") ?? process.env.CAPACIDAD_ADMIN_CORREO;
  if (!organizationId || !adminEmail) throw new Error(usage);

  const context = await getAdminContextForScript({
    organizationId,
    adminEmail,
  });
  if (!context) {
    throw new Error(
      "El correo no es de un admin activo de esa organización. No se cargó nada.",
    );
  }
  const attributes = await listAttributes(context);
  const models = await listModels(context);
  if (!attributes.ok || !models.ok) {
    throw new Error(
      "La organización no tiene la capacidad variants. Activala primero con org:capability --profile iphone.",
    );
  }
  const existing = await searchProducts(context, { text: "", activity: "all" });
  if (!existing.ok) throw new Error("No se pudieron leer los productos.");
  const catalogSkus = new Set(
    DEMO_IPHONE_CATALOG.flatMap((model) =>
      model.variants.map((variant) => demoProduct(model, variant).sku),
    ),
  );
  const catalogModels = new Set(DEMO_IPHONE_CATALOG.map((model) => model.name));
  const foreign =
    existing.products.some((product) => !catalogSkus.has(product.sku)) ||
    models.models.some((model) => !catalogModels.has(model.name));
  if (foreign) {
    throw new Error(
      "La organización ya tiene productos o modelos que no son del catálogo de ejemplo. Es solo para una organización vacía. No se cargó nada.",
    );
  }
  const resuming = existing.products.length > 0 || models.models.length > 0;
  const modelIds = new Map(
    models.models.map((model) => [model.name, model.id]),
  );
  const productIds = new Map(
    existing.products.map((product) => [product.sku, product.id]),
  );
  const prices = await getCurrentPrices(context, [...productIds.values()]);
  if (!prices.ok) throw new Error("No se pudieron leer los precios.");

  const definition = (key: string) => {
    const found = attributes.definitions.find(
      (candidate) => candidate.key === key && candidate.isActive,
    );
    if (!found)
      throw new Error(`Falta el atributo «${key}» del perfil de iPhone.`);
    return found;
  };
  const capacity = definition("capacidad");
  const color = definition("color");
  const optionId = (target: typeof capacity, label: string) => {
    const found = target.options.find((option) => option.label === label);
    if (!found)
      throw new Error(`Falta la opción «${label}» en «${target.name}».`);
    return found.id;
  };

  let productCount = 0;
  let pricedCount = 0;
  for (const model of DEMO_IPHONE_CATALOG) {
    let modelId = modelIds.get(model.name);
    if (!modelId) {
      const created = await createModel(context, {
        name: model.name,
        brand: DEMO_IPHONE_BRAND,
      });
      if (!created.ok) {
        throw new Error(`Modelo ${model.name}: ${created.code}`);
      }
      modelId = created.modelId;
    }
    for (const variant of model.variants) {
      const { sku, name } = demoProduct(model, variant);
      const found = productIds.get(sku);
      if (found) {
        // Ya cargado en una corrida anterior: solo falta el precio, si se cortó antes de fijarlo.
        if (!prices.prices.has(found)) {
          await setDemoPrice(context, found, sku, variant.price);
          pricedCount += 1;
        }
        continue;
      }
      const product = await createProduct(context, {
        sku,
        name,
        description: null,
        unit: "unidad",
        reorderPoint: "1",
        brand: DEMO_IPHONE_BRAND,
        category: DEMO_IPHONE_CATEGORY,
        condition: variant.condition,
        barcode: null,
        weightKg: null,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
        location: null,
        shelf: null,
        variant: {
          modelId,
          attributes: {
            [capacity.id]: optionId(capacity, variant.capacity),
            [color.id]: optionId(color, variant.color),
          },
        },
      });
      if (!product.ok) throw new Error(`Producto ${sku}: ${product.code}`);
      await setDemoPrice(context, product.productId, sku, variant.price);
      productCount += 1;
    }
  }
  console.log(
    resuming
      ? `Carga anterior retomada: ${productCount} productos nuevos y ${pricedCount} precios que faltaban, en USD. El catálogo de ejemplo está completo.`
      : `Catálogo de ejemplo cargado: ${DEMO_IPHONE_CATALOG.length} modelos y ${productCount} productos con precio en USD.`,
  );
}

async function setDemoPrice(
  context: Parameters<typeof setProductPrice>[0],
  productId: string,
  sku: string,
  amount: string,
) {
  const price = await setProductPrice(context, productId, {
    amount: amount.replace(".", ","),
    currency: "USD",
    // Un producto sin precio vigente.
    expectedPriceId: "",
  });
  if (!price.ok) throw new Error(`Precio de ${sku}: ${price.code}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) await getDb().$client.end();
  });
