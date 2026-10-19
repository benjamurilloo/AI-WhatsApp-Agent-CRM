import type { Metadata } from "next";
import { listProductPrices, PRICES_PAGE_SIZE } from "@/modules/catalog";
import { getProductStock } from "@/modules/inventory";
import {
  getMainCurrency,
  getOrganizationTimezone,
} from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { ActionNotice } from "@/app/_components/action-notice";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { acceptedCurrencies, formatMoney } from "@/shared/money";
import type { SearchParams } from "../../filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  PRODUCT_NOT_FOUND_MESSAGE,
} from "../../messages";
import {
  INACTIVE_PRODUCT_PRICE_NOTICE,
  NO_PRICES_MESSAGE,
  priceNoticeMessage,
  priceText,
} from "./messages";
import { PriceForm } from "./price-form";
import { ProductSubNav } from "../product-sub-nav";

export const metadata: Metadata = {
  title: "Precios — AI WhatsApp Agent CRM",
};

const TITLE = "Precios";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Monedas que se pueden elegir, con su nombre en español: «USD — dólar estadounidense».
function currencyOptions(): { code: string; label: string }[] {
  const names = new Intl.DisplayNames("es", { type: "currency" });
  return acceptedCurrencies().map((code) => ({
    code,
    label: `${code} — ${names.of(code) ?? code}`,
  }));
}

// Pantalla de precios (brief-11.1, FR-PROD-12 y FR-PROD-13): el precio vigente, el formulario
// para fijar uno nuevo, solo para admin y con el producto activo, y el historial completo,
// paginado, para admin y viewer. Ningún precio se edita ni se borra: uno nuevo se agrega.
// Presentación de la 15.4: tarjetas y la barra de subpantallas del producto (brief-15.4, D-3).
export default async function PricesPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { productId } = await params;
  const query = await searchParams;

  const found = await getProductStock(context, productId);
  const history = found.ok
    ? await listProductPrices(context, found.product.id, page(query.pagina))
    : found;
  if (!found.ok || !history.ok) {
    const code = found.ok ? (history.ok ? null : history.code) : found.code;
    if (code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={PRODUCT_NOT_FOUND_MESSAGE}
        back={{ href: "/productos", label: "Volver a productos" }}
      />
    );
  }

  const product = found.product;
  const isAdmin = context.role === "admin";
  const notice = priceNoticeMessage(query.aviso);
  const timeZone = await getOrganizationTimezone(context);
  const pageHref = (target: number) =>
    target > 1
      ? `/productos/${product.id}/precios?pagina=${target}`
      : `/productos/${product.id}/precios`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href={`/productos/${product.id}`} label="Volver al producto" />
      <DetailHeader
        title={product.name}
        leading={<HeaderIcon name="tag" />}
        subtitle={
          <p>
            Precios · Precio vigente:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {priceText(history.current)}
            </span>
          </p>
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <ProductSubNav productId={product.id} current="precios" />

      {isAdmin ? (
        product.isActive ? (
          <SectionCard
            id="precio-titulo"
            title="Fijar precio"
            icon="tag"
            description="El precio nuevo reemplaza al vigente y el anterior queda en el historial."
            className="mt-6"
          >
            <PriceForm
              productId={product.id}
              current={history.current}
              currencies={currencyOptions()}
              defaultCurrency={await getMainCurrency(context.organizationId)}
            />
          </SectionCard>
        ) : (
          <p className={`mt-6 ${cardClass} p-6`}>
            {INACTIVE_PRODUCT_PRICE_NOTICE}
          </p>
        )
      ) : null}

      <SectionCard
        id="historial-titulo"
        title="Historial de precios"
        icon="history"
        className="mt-6"
      >
        {history.total === 0 ? (
          <p>{NO_PRICES_MESSAGE}</p>
        ) : (
          <>
            <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Historial de precios de {product.name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Fecha
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Precio
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Autor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className={`${tableCellClass} whitespace-nowrap`}>
                        {formatShortDateTime(entry.createdAt, timeZone)}
                        {entry.id === history.current?.id ? (
                          <span className="ml-2 text-sm text-muted">
                            · vigente
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`${tableCellClass} text-right tabular-nums`}
                      >
                        {formatMoney(entry.amount, entry.currency)}
                      </td>
                      <td className={`${tableCellClass} text-muted`}>
                        {entry.author.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul
              aria-label={`Historial de precios de ${product.name}`}
              className="flex flex-col gap-3 md:hidden"
            >
              {history.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-border bg-surface-muted p-4"
                >
                  <p className="text-sm text-muted">
                    {formatShortDateTime(entry.createdAt, timeZone)} ·{" "}
                    {entry.author.name}
                    {entry.id === history.current?.id ? " · vigente" : ""}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">
                    {formatMoney(entry.amount, entry.currency)}
                  </p>
                </li>
              ))}
            </ul>

            <Pagination
              className="mt-4"
              page={history.page}
              pageCount={history.pageCount}
              rangeText={shownRangeText({
                page: history.page,
                pageSize: PRICES_PAGE_SIZE,
                shown: history.entries.length,
                total: history.total,
                singular: "precio",
                plural: "precios",
              })}
              hrefFor={pageHref}
            />
          </>
        )}
      </SectionCard>

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
