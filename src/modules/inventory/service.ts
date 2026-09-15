import {
  deriveStockStatus,
  getProduct,
  searchProducts,
  type Product,
  type ProductActivityFilter,
  type StockStatus,
} from "@/modules/catalog";
import type { AuthContext } from "@/modules/organizations";
import type { Failure } from "@/shared/errors";
import { quantityFromDatabase } from "@/shared/quantity";
import * as repository from "./repository";

// Productos con saldo y estado de stock (brief-4.2, D-1): catalog aporta los productos y deriva
// el estado; inventory aporta el saldo y compone en memoria, sin JOIN entre módulos.

const ZERO_BALANCE = "0.000";

export type ProductStock = Product & {
  quantityOnHand: string;
  stockStatus: StockStatus;
};

export function withStock(
  product: Product,
  balances: Map<string, string>,
): ProductStock {
  const quantityOnHand = balances.get(product.id) ?? ZERO_BALANCE;
  return {
    ...product,
    quantityOnHand,
    stockStatus: deriveStockStatus(
      quantityFromDatabase(quantityOnHand),
      quantityFromDatabase(product.reorderPoint),
    ),
  };
}

export const PRODUCTS_PAGE_SIZE = 25;

export type StockStatusFilter = "all" | StockStatus;

export type ProductListFilters = {
  text: string;
  stockStatus: StockStatusFilter;
  activity: ProductActivityFilter;
  page: number;
};

export type ProductStockPage = {
  products: ProductStock[];
  total: number;
  page: number;
  pageCount: number;
};

const collator = new Intl.Collator("es", { sensitivity: "base" });

// Filtra por estado, ordena por nombre y pagina. Una página fuera de rango se lleva a la última.
export function composeProductStockPage(
  products: Product[],
  balances: Map<string, string>,
  filters: Pick<ProductListFilters, "stockStatus" | "page">,
): ProductStockPage {
  const matching = products
    .map((product) => withStock(product, balances))
    .filter(
      (product) =>
        filters.stockStatus === "all" ||
        product.stockStatus === filters.stockStatus,
    )
    .sort(
      (a, b) =>
        collator.compare(a.name, b.name) ||
        collator.compare(a.sku, b.sku) ||
        a.id.localeCompare(b.id),
    );

  const pageCount = Math.max(
    1,
    Math.ceil(matching.length / PRODUCTS_PAGE_SIZE),
  );
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const start = (page - 1) * PRODUCTS_PAGE_SIZE;
  return {
    products: matching.slice(start, start + PRODUCTS_PAGE_SIZE),
    total: matching.length,
    page,
    pageCount,
  };
}

// Lista de la pantalla 3 (FR-PROD-04). Límite aceptado: lee todos los productos que cumplen
// texto y actividad; se revisa en la Fase 8 o con más de 2 000 productos (D-1).
export async function listProductStock(
  context: AuthContext,
  filters: ProductListFilters,
): Promise<({ ok: true } & ProductStockPage) | Failure<"FORBIDDEN">> {
  const found = await searchProducts(context, filters);
  if (!found.ok) return found;
  const balances = await repository.findBalances(
    context.organizationId,
    found.products.map((product) => product.id),
  );
  return {
    ok: true,
    ...composeProductStockPage(found.products, balances, filters),
  };
}

// Detalle de la pantalla 4: el producto con su saldo y estado.
export async function getProductStock(
  context: AuthContext,
  productId: string,
): Promise<
  | { ok: true; product: ProductStock }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  const balances = await repository.findBalances(context.organizationId, [
    found.product.id,
  ]);
  return { ok: true, product: withStock(found.product, balances) };
}
