import { sql } from "drizzle-orm";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/modules/auth";
import { users } from "@/modules/auth/schema";
import {
  attributeDefinitions,
  attributeOptions,
  attributeValues,
  productModels,
  productPrices,
  products,
} from "@/modules/catalog/schema";
import { getProfile } from "@/modules/organizations";
import {
  organizationCapabilities,
  organizationMembers,
  organizations,
} from "@/modules/organizations/schema";
import type { Db } from "@/shared/db";
import { isSeedableDatabase, mensajeBaseNoSeedeable } from "./basic";

// El catálogo de ejemplo de una tienda de iPhone (brief-29.2, D-9). Lo usan dos caminos:
//   - el script `npm run demo:catalog`, que lo carga en una organización real (la demo «iPhone Demo»)
//     por los servicios de catalog, con sus reglas y su auditoría;
//   - seedIphone, que arma una organización sintética para desarrollo y end-to-end, escribiendo
//     directo en la base como los demás seeds, y solo en una base de prueba.
// Los precios son de ejemplo, en USD, y no son de ningún negocio.

export type DemoVariant = {
  capacity: string;
  color: string;
  condition: "new" | "refurbished";
  price: string;
};

export type DemoModel = { name: string; code: string; variants: DemoVariant[] };

const v = (
  capacity: string,
  color: string,
  condition: DemoVariant["condition"],
  price: string,
): DemoVariant => ({ capacity, color, condition, price });

export const DEMO_IPHONE_BRAND = "Apple";
export const DEMO_IPHONE_CATEGORY = "Celulares";

export const DEMO_IPHONE_CATALOG: readonly DemoModel[] = [
  {
    name: "iPhone 11",
    code: "IP11",
    variants: [
      v("64 GB", "Negro", "refurbished", "249.00"),
      v("64 GB", "Blanco", "refurbished", "249.00"),
      v("128 GB", "Violeta", "refurbished", "289.00"),
    ],
  },
  {
    name: "iPhone 12",
    code: "IP12",
    variants: [
      v("64 GB", "Negro", "refurbished", "299.00"),
      v("128 GB", "Azul", "refurbished", "339.00"),
    ],
  },
  {
    name: "iPhone 13",
    code: "IP13",
    variants: [
      v("128 GB", "Medianoche", "refurbished", "399.00"),
      v("128 GB", "Azul", "refurbished", "399.00"),
      v("128 GB", "Rosa", "refurbished", "399.00"),
      v("256 GB", "Medianoche", "refurbished", "449.00"),
    ],
  },
  {
    name: "iPhone 13 Pro",
    code: "IP13P",
    variants: [
      v("128 GB", "Grafito", "refurbished", "489.00"),
      v("256 GB", "Azul Sierra", "refurbished", "539.00"),
    ],
  },
  {
    name: "iPhone 14",
    code: "IP14",
    variants: [
      v("128 GB", "Medianoche", "refurbished", "479.00"),
      v("128 GB", "Violeta", "refurbished", "479.00"),
      v("256 GB", "Medianoche", "refurbished", "529.00"),
    ],
  },
  {
    name: "iPhone 14 Pro",
    code: "IP14P",
    variants: [
      v("128 GB", "Morado oscuro", "refurbished", "599.00"),
      v("256 GB", "Plata", "refurbished", "659.00"),
    ],
  },
  {
    name: "iPhone 15",
    code: "IP15",
    variants: [
      v("128 GB", "Negro", "new", "749.00"),
      v("128 GB", "Azul", "new", "749.00"),
      v("128 GB", "Rosa", "new", "749.00"),
      v("256 GB", "Negro", "new", "849.00"),
    ],
  },
  {
    name: "iPhone 15 Pro",
    code: "IP15P",
    variants: [
      v("128 GB", "Titanio natural", "new", "949.00"),
      v("128 GB", "Titanio negro", "new", "949.00"),
      v("256 GB", "Titanio natural", "new", "1049.00"),
    ],
  },
  {
    name: "iPhone 15 Pro Max",
    code: "IP15PM",
    variants: [
      v("256 GB", "Titanio natural", "new", "1149.00"),
      v("512 GB", "Titanio negro", "new", "1349.00"),
    ],
  },
  {
    name: "iPhone 16",
    code: "IP16",
    variants: [
      v("128 GB", "Negro", "new", "849.00"),
      v("128 GB", "Ultramarino", "new", "849.00"),
      v("128 GB", "Verde azulado", "new", "849.00"),
      v("256 GB", "Ultramarino", "new", "949.00"),
    ],
  },
  {
    name: "iPhone 16 Pro",
    code: "IP16P",
    variants: [
      v("128 GB", "Titanio desierto", "new", "1049.00"),
      v("128 GB", "Titanio negro", "new", "1049.00"),
      v("256 GB", "Titanio desierto", "new", "1149.00"),
    ],
  },
  {
    name: "iPhone 16 Pro Max",
    code: "IP16PM",
    variants: [
      v("256 GB", "Titanio desierto", "new", "1249.00"),
      v("256 GB", "Titanio blanco", "new", "1249.00"),
      v("512 GB", "Titanio negro", "new", "1449.00"),
    ],
  },
];

// Abreviatura del color para el SKU: una palabra, sus tres primeras letras («Azul» → AZU); dos, la
// inicial de la primera y tres letras de la segunda («Titanio natural» → TNAT, «Titanio negro» →
// TNEG), para que dos colores de la misma familia no compartan SKU.
function colorCode(color: string): string {
  const words = color
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .split(/\s+/);
  return words.length > 1
    ? `${words[0]![0]}${words[1]!.slice(0, 3)}`
    : words[0]!.slice(0, 3);
}

// SKU, nombre y datos del producto de una variante: «IP13-128-AZU-R», «iPhone 13 128 GB Azul
// reacondicionado».
export function demoProduct(model: DemoModel, variant: DemoVariant) {
  const capacity = variant.capacity.replace(/\s*GB$/, "").replace(/\s+/g, "");
  const condition = variant.condition === "new" ? "N" : "R";
  return {
    sku: `${model.code}-${capacity}-${colorCode(variant.color)}-${condition}`,
    name: `${model.name} ${variant.capacity} ${variant.color}${variant.condition === "new" ? "" : " reacondicionado"}`,
  };
}

// Organización sintética para desarrollo y end-to-end (brief-29.2, D-11): una tienda de iPhone con la
// capacidad variants, el perfil copiado y un catálogo chico. Idempotente, con ids fijos.

export const SEED_IPHONE_ORGANIZATION_ID =
  "5eed0000-0000-4000-8000-000000000002";

export const SEED_IPHONE_USERS = [
  {
    id: "5eed0000-0000-4000-8000-000000000021",
    email: "admin-iphone@example.com",
    name: "Admin de la tienda de ejemplo",
    role: "admin",
  },
  {
    id: "5eed0000-0000-4000-8000-000000000022",
    email: "lectura-iphone@example.com",
    name: "Lectura de la tienda de ejemplo",
    role: "viewer",
  },
] as const;

// Los modelos que siembra: dos, para probar la ficha y el filtro sin depender del catálogo entero.
const SEEDED_MODELS = ["iPhone 13", "iPhone 15"];

function seedId(group: number, index: number): string {
  return `5eed0000-0000-4000-8${String(group).padStart(3, "0")}-${String(index).padStart(12, "0")}`;
}

export async function seedIphone(db: Db, password: string): Promise<void> {
  const current = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  const name = current.rows[0]?.name ?? "";
  if (!isSeedableDatabase(name)) throw new Error(mensajeBaseNoSeedeable(name));
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `La contraseña del seed necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    );
  }
  const profile = getProfile("iphone");
  if (!profile) throw new Error("Falta el perfil iphone.");
  const passwordHash = await hashPassword(password);
  const organizationId = SEED_IPHONE_ORGANIZATION_ID;
  const admin = SEED_IPHONE_USERS[0];

  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: organizationId, name: "Tienda de ejemplo (iPhone)" })
      .onConflictDoNothing();
    for (const user of SEED_IPHONE_USERS) {
      const values = {
        email: user.email,
        name: user.name,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      };
      await tx
        .insert(users)
        .values({ id: user.id, ...values })
        .onConflictDoUpdate({ target: users.id, set: values });
      await tx
        .insert(organizationMembers)
        .values({ organizationId, userId: user.id, role: user.role })
        .onConflictDoUpdate({
          target: organizationMembers.userId,
          set: { organizationId, role: user.role },
        });
    }
    await tx
      .insert(organizationCapabilities)
      .values({ organizationId, capability: "variants", activatedBy: admin.id })
      .onConflictDoNothing();

    // El perfil: definiciones y opciones con ids fijos.
    const optionIds = new Map<string, string>();
    const definitionIds = new Map<string, string>();
    for (const [index, attribute] of profile.attributes.entries()) {
      const definitionId = seedId(201, index + 1);
      definitionIds.set(attribute.key, definitionId);
      await tx
        .insert(attributeDefinitions)
        .values({
          id: definitionId,
          organizationId,
          entity: "product",
          key: attribute.key,
          name: attribute.name,
          type: attribute.type,
          isRequired: attribute.isRequired,
          isVariant: attribute.isVariant,
          position: index,
        })
        .onConflictDoNothing();
      for (const [position, label] of attribute.options.entries()) {
        const optionId = seedId(202 + index, position + 1);
        optionIds.set(`${attribute.key}:${label}`, optionId);
        await tx
          .insert(attributeOptions)
          .values({
            id: optionId,
            organizationId,
            definitionId,
            label,
            position,
          })
          .onConflictDoNothing();
      }
    }

    let productIndex = 0;
    for (const [modelIndex, modelName] of SEEDED_MODELS.entries()) {
      const model = DEMO_IPHONE_CATALOG.find(
        (candidate) => candidate.name === modelName,
      )!;
      const modelId = seedId(210, modelIndex + 1);
      await tx
        .insert(productModels)
        .values({
          id: modelId,
          organizationId,
          name: model.name,
          brand: DEMO_IPHONE_BRAND,
          position: modelIndex,
        })
        .onConflictDoNothing();
      for (const variant of model.variants.slice(0, 2)) {
        productIndex += 1;
        const productId = seedId(211, productIndex);
        const { sku, name: productName } = demoProduct(model, variant);
        await tx
          .insert(products)
          .values({
            id: productId,
            organizationId,
            sku,
            name: productName,
            brand: DEMO_IPHONE_BRAND,
            category: DEMO_IPHONE_CATEGORY,
            condition: variant.condition,
            modelId,
          })
          .onConflictDoNothing();
        for (const [key, label] of [
          ["capacidad", variant.capacity],
          ["color", variant.color],
        ] as const) {
          await tx
            .insert(attributeValues)
            .values({
              organizationId,
              productId,
              definitionId: definitionIds.get(key)!,
              optionId: optionIds.get(`${key}:${label}`)!,
            })
            .onConflictDoNothing();
        }
        await tx
          .insert(productPrices)
          .values({
            id: seedId(212, productIndex),
            organizationId,
            productId,
            amount: variant.price,
            currency: "USD",
            createdBy: admin.id,
          })
          .onConflictDoNothing();
      }
    }
  });
}
