import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCurrentPrices,
  getModel,
  getProductVariants,
  hasVariants,
} from "@/modules/catalog";
import { listProductStock } from "@/modules/inventory";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { EmptyState } from "@/app/_components/empty-state";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  linkClass,
  primaryLinkClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { CONDITION_LABEL } from "../../productos/messages";
import { ActiveToggleForm, ModelForm } from "../forms";
import {
  FORBIDDEN_ACTION_MESSAGE,
  MODEL_NOT_FOUND_MESSAGE,
  noticeMessage,
} from "../messages";

export const metadata: Metadata = {
  title: "Modelo — AI WhatsApp Agent CRM",
};

// Hasta este número de variantes en la ficha; las demás, en la lista de productos filtrada.
const VARIANTS_SHOWN = 50;

// Ficha de un modelo (brief-29.2, D-4): sus variantes juntas, con la condición, la capacidad y el
// color, el precio y lo disponible. Un admin la edita, la desactiva y carga una variante nueva con
// el modelo elegido. Sin la capacidad, 404.
export default async function ModelPage({
  params,
  searchParams,
}: {
  params: Promise<{ modelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  const { modelId } = await params;
  const query = await searchParams;
  // Sin la capacidad, la sección entera no existe (D-3); un id que no es un modelo de la
  // organización es «este modelo no existe».
  if (!(await hasVariants(context))) notFound();
  const found = await getModel(context, modelId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title="Modelos" message={FORBIDDEN_ACTION_MESSAGE} />;
    }
    return (
      <PageNotice
        title="Modelos"
        message={MODEL_NOT_FOUND_MESSAGE}
        back={{ href: "/modelos", label: "Volver a modelos" }}
      />
    );
  }
  const model = found.model;
  const isAdmin = context.role === "admin";
  const editing = isAdmin && query.editar === "1";
  const notice = noticeMessage(query.aviso);

  const stock = await listProductStock(context, {
    text: "",
    stockStatus: "all",
    activity: "all",
    page: 1,
    modelId: model.id,
    sort: "name_asc",
    pageSize: VARIANTS_SHOWN,
  });
  const products = stock.ok ? stock.products : [];
  const [prices, variants] = await Promise.all([
    getCurrentPrices(
      context,
      products.map((product) => product.id),
    ),
    getProductVariants(context, products),
  ]);
  const priceText = (productId: string) => {
    const price = prices.ok ? prices.prices.get(productId) : undefined;
    return price ? formatMoney(price.amount, price.currency) : "Sin precio";
  };
  const variantText = (productId: string) =>
    (variants?.get(productId)?.attributes ?? [])
      .filter((attribute) => attribute.isVariant)
      .map((attribute) => attribute.value)
      .join(" · ") || "—";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/modelos" label="Volver a modelos" />
      <DetailHeader
        title={model.name}
        leading={<HeaderIcon name="layers" />}
        badges={
          <span
            className={model.isActive ? activeBadgeClass : inactiveBadgeClass}
          >
            {model.isActive ? "Activo" : "Inactivo"}
          </span>
        }
        subtitle={model.brand ?? undefined}
        actions={
          isAdmin && !editing ? (
            <>
              {model.isActive ? (
                <Link
                  href={`/productos/nuevo?modelo=${model.id}`}
                  className={primaryLinkClass}
                >
                  + Nueva variante
                </Link>
              ) : null}
              <Link
                href={`/modelos/${model.id}?editar=1`}
                className={secondaryLinkClass}
              >
                <Icon name="pencil" className="size-4" />
                Editar
              </Link>
            </>
          ) : null
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {editing ? (
        <SectionCard
          id="editar-modelo-titulo"
          title="Editar modelo"
          icon="pencil"
          className="mt-6"
        >
          <ModelForm
            mode="editar"
            modelId={model.id}
            values={{ name: model.name, brand: model.brand ?? "" }}
          />
        </SectionCard>
      ) : null}

      {isAdmin ? (
        <SectionCard
          id="estado-modelo-titulo"
          title="Estado"
          icon="power"
          className="mt-6"
        >
          <p className="mb-3 text-sm text-muted">
            {model.isActive
              ? "Un modelo desactivado no se ofrece al cargar productos. Sus productos siguen como están."
              : "Este modelo no se ofrece al cargar productos."}
          </p>
          <ActiveToggleForm
            kind="model"
            id={model.id}
            name={model.name}
            isActive={model.isActive}
          />
        </SectionCard>
      ) : null}

      <h2 className="mt-8 text-lg font-semibold text-foreground">Variantes</h2>
      {products.length === 0 ? (
        <EmptyState
          icon="package"
          title="Este modelo todavía no tiene productos."
          description="Cada combinación de capacidad, color y condición es un producto."
          className="mt-4"
        />
      ) : (
        <>
          <div className={`mt-4 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Variantes de {model.name}</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Producto
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Condición
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Variante
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Precio
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Disponible
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Activo
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className={`${tableCellClass} font-semibold`}>
                      <Link
                        href={`/productos/${product.id}`}
                        className={linkClass}
                      >
                        {product.name}
                      </Link>
                      <span className="block font-mono text-xs font-normal text-muted">
                        {product.sku}
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      {CONDITION_LABEL[product.condition]}
                    </td>
                    <td className={tableCellClass}>
                      {variantText(product.id)}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {priceText(product.id)}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {formatQuantity(product.quantityAvailable)}
                    </td>
                    <td className={tableCellClass}>
                      <span
                        className={
                          product.isActive
                            ? activeBadgeClass
                            : inactiveBadgeClass
                        }
                      >
                        {product.isActive ? "Sí" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul
            aria-label={`Variantes de ${model.name}`}
            className="mt-4 flex flex-col gap-3 md:hidden"
          >
            {products.map((product) => (
              <li
                key={product.id}
                className={`${cardClass} flex flex-col gap-1 p-4`}
              >
                <Link
                  href={`/productos/${product.id}`}
                  className={`${linkClass} font-semibold`}
                >
                  {product.name}
                </Link>
                <p className="text-sm text-muted">
                  {CONDITION_LABEL[product.condition]} ·{" "}
                  {variantText(product.id)}
                  {product.isActive ? "" : " · Inactivo"}
                </p>
                <p className="text-sm tabular-nums">
                  {priceText(product.id)} ·{" "}
                  {formatQuantity(product.quantityAvailable)} disponible
                </p>
              </li>
            ))}
          </ul>
          {stock.ok && stock.total > products.length ? (
            <p className="mt-3 text-sm">
              <Link
                href={`/productos?modelo=${model.id}&actividad=todos`}
                className={linkClass}
              >
                Ver las {stock.total} variantes en la lista de productos
              </Link>
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
