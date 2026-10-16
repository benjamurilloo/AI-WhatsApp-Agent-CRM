import { searchProducts } from "@/modules/catalog";
import type { AuthContext } from "@/modules/organizations";
import { listSuppliers } from "@/modules/purchasing";

// Sin JavaScript, el buscador es un campo de texto, como en el pedido (brief-19.2, D-7): el
// proveedor se reconoce por su nombre exacto entre los activos, y el producto por su SKU exacto. Lo
// usan el alta de la orden de compra (brief-22.3) y, desde la 22.4, el de la recepción. No es una
// Server Action: lo llaman las acciones.

export async function resolveSupplierText(
  context: AuthContext,
  supplierText: string,
): Promise<string> {
  const found = await listSuppliers(context, {
    text: supplierText,
    status: "active",
    page: 1,
  });
  const exact = found.ok
    ? found.suppliers.filter(
        (supplier) =>
          supplier.name.toLowerCase() === supplierText.toLowerCase(),
      )
    : [];
  return exact.length === 1 ? exact[0]!.id : "";
}

export async function resolveProductText(
  context: AuthContext,
  productText: string,
): Promise<{ productId: string; productText: string } | null> {
  const found = await searchProducts(context, {
    text: productText,
    activity: "active",
  });
  const exact = found.ok
    ? found.products.filter(
        (product) => product.sku.toLowerCase() === productText.toLowerCase(),
      )
    : [];
  if (exact.length !== 1) return null;
  const product = exact[0]!;
  return {
    productId: product.id,
    productText: `${product.name} (${product.sku})`,
  };
}
