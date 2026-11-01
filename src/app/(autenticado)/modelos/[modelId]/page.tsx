import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCurrentPrices,
  getModel,
  getProductVariants,
  hasVariants,
} from "@/modules/catalog";
import { listProductStock, sumStockByModel } from "@/modules/inventory";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import { EmptyState } from "@/app/_components/empty-state";
import {
  cardClass,
  linkClass,
  primaryLinkClass,
  secondaryLinkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { StatTile } from "@/app/_components/stat-tile";
import { StatusBadge } from "@/app/_components/status-badge";
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
  // Las dos tarjetas de resumen (lámina 04). Salen del mismo pliegue que la columna «Disponibles»
  // del listado, acotado a este modelo: la ficha y el listado no pueden decir números distintos. No
  // salen de `products`, que viene cortado en VARIANTS_SHOWN y daría de menos pasado ese corte.
  const summary = await sumStockByModel(context, model.id);
  const totals = summary.ok ? summary.totals.get(model.id) : undefined;
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
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <div
        inert={editing ? true : undefined}
        className={editing ? "opacity-60" : undefined}
      >
        <BackLink href="/modelos" label="Volver a modelos" />
        <DetailHeader
          title={model.name}
          leading={<HeaderIcon name="layers" />}
          badges={
            <StatusBadge
              tone={model.isActive ? "success" : "neutral"}
              icon={model.isActive ? "circleCheck" : "circleMinus"}
            >
              {model.isActive ? "Activo" : "Inactivo"}
            </StatusBadge>
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

        {/* Las dos tarjetas de la lámina 04. Se rotula «disponibles» y no «unidades disponibles»
          (D-2): un modelo puede agrupar productos por cantidad, donde la unidad no existe. Dos
          columnas solo cuando la ventana y el contenedor dan el ancho (convención de la 24.5.1-b). */}
        <div className="@container mt-6">
          <div className="grid grid-cols-1 gap-3 sm:@md:grid-cols-2">
            <StatTile
              icon="package"
              value={String(totals?.products ?? 0)}
              label={
                totals?.products === 1
                  ? "variante registrada"
                  : "variantes registradas"
              }
            />
            <StatTile
              icon="layers"
              value={formatQuantity(totals?.quantityAvailable ?? "0.000")}
              label="disponibles"
            />
          </div>
        </div>

        <h2 className="mt-8 text-lg font-semibold text-foreground">
          Variantes del modelo
        </h2>
        {products.length === 0 ? (
          <EmptyState
            icon="package"
            title="Este modelo todavía no tiene productos."
            description="Cada combinación de capacidad, color y condición es un producto."
            className="mt-4"
          />
        ) : (
          <>
            <div
              className={`mt-4 hidden overflow-x-auto md:block ${cardClass}`}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Variantes de {model.name}</caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Producto
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Disponibles
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Precio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      {/* La lámina pone la variante como título y el SKU debajo; acá el título es el
                        nombre del producto, que es su identidad en el resto del CRM. La condición y
                        el estado bajan a la línea secundaria en vez de perderse: la tabla queda en
                        tres columnas como la lámina y no se va ningún dato. */}
                      <td className={`${tableCellClass} font-semibold`}>
                        <Link
                          href={`/productos/${product.id}`}
                          className={linkClass}
                        >
                          {product.name}
                        </Link>
                        <span className="block text-xs font-normal text-muted">
                          {[
                            variantText(product.id),
                            CONDITION_LABEL[product.condition],
                            product.isActive ? null : "Inactivo",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="block font-mono text-xs font-normal text-muted">
                          {product.sku}
                        </span>
                      </td>
                      <td
                        className={`${tableCellClass} text-right tabular-nums`}
                      >
                        {formatQuantity(product.quantityAvailable)}
                      </td>
                      <td
                        className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                      >
                        {priceText(product.id)}
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
      </div>

      {/* La edición en el mismo panel lateral que el alta de `/modelos`: lo abre y lo cierra la URL
          (`?editar=1`), anda sin JavaScript y deja el **cuerpo de la pantalla** `inert` —no el marco
          de la aplicación, que lo pinta el layout y sigue alcanzable por teclado, y por eso el panel
          no declara `aria-modal` (revisión independiente de la 24.5.3, F-10)—. El estado del modelo vive acá
          adentro, como el «Modelo activo» de la lámina, y no en una tarjeta siempre visible: es una
          escritura propia, con su propio registro de auditoría, no un campo del formulario. */}
      {editing ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-overlay" />
          <aside
            role="dialog"
            aria-labelledby="editar-modelo-titulo"
            className="relative z-10 flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-surface p-6 shadow-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="editar-modelo-titulo" className={sectionTitleClass}>
                Editar {model.name}
              </h2>
              <Link
                href={`/modelos/${model.id}`}
                aria-label="Cerrar el panel"
                className={secondaryLinkClass}
              >
                <Icon name="close" className="size-4" />
              </Link>
            </div>
            <ModelForm
              mode="editar"
              modelId={model.id}
              values={{ name: model.name, brand: model.brand ?? "" }}
              autoFocus
            />
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-sm text-muted">
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
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
