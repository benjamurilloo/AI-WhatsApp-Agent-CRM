import type { Metadata } from "next";
import {
  COSTS_PAGE_SIZE,
  getProductCostSummary,
  listProductCosts,
} from "@/modules/catalog";
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
import { ProductSubNav } from "../product-sub-nav";
import { CostForm } from "./cost-form";
import { CostSummary } from "./cost-summary";
import {
  COST_DESCRIPTION,
  costNoticeMessage,
  costText,
  INACTIVE_PRODUCT_COST_NOTICE,
  NO_COSTS_MESSAGE,
} from "./messages";

export const metadata: Metadata = {
  title: "Costos — AI WhatsApp Agent CRM",
};

const TITLE = "Costos";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// Monedas que se pueden elegir, con su nombre en español, como en la pantalla de precios.
function currencyOptions(): { code: string; label: string }[] {
  const names = new Intl.DisplayNames("es", { type: "currency" });
  return acceptedCurrencies().map((code) => ({
    code,
    label: `${code} — ${names.of(code) ?? code}`,
  }));
}

// Pantalla de costos (brief-18.2, FR-PROD-19 a 21; D-3): el costo y el margen, el formulario para
// fijar un costo nuevo con el producto activo y el historial completo, paginado. **Solo admin**
// (D-1): un viewer recibe el aviso de acceso denegado, porque las dos lecturas del servicio le
// devuelven FORBIDDEN. Ningún costo se edita ni se borra: uno nuevo se agrega.
export default async function CostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { productId } = await params;
  const query = await searchParams;

  const [summary, history] = await Promise.all([
    getProductCostSummary(context, productId),
    listProductCosts(context, productId, page(query.pagina)),
  ]);
  if (!summary.ok || !history.ok) {
    const code = summary.ok ? (history.ok ? null : history.code) : summary.code;
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
  const product = summary.product;
  const notice = costNoticeMessage(query.aviso);
  const timeZone = await getOrganizationTimezone(context);
  const pageHref = (target: number) =>
    target > 1
      ? `/productos/${product.id}/costos?pagina=${target}`
      : `/productos/${product.id}/costos`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href={`/productos/${product.id}`} label="Volver al producto" />
      <DetailHeader
        title={product.name}
        leading={<HeaderIcon name="creditCard" />}
        subtitle={
          <p>
            Costos · Costo vigente:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {costText(summary.cost)}
            </span>
          </p>
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <ProductSubNav productId={product.id} current="costos" />

      <SectionCard
        id="margen-titulo"
        title="Costo y margen"
        icon="pieChart"
        className="mt-6"
      >
        <CostSummary
          cost={summary.cost}
          price={summary.price}
          margin={summary.margin}
        />
      </SectionCard>

      {product.isActive ? (
        <SectionCard
          id="costo-titulo"
          title="Fijar costo"
          icon="creditCard"
          description={`${COST_DESCRIPTION} El costo nuevo reemplaza al vigente y el anterior queda en el historial.`}
          className="mt-6"
        >
          <CostForm
            productId={product.id}
            current={summary.cost}
            currencies={currencyOptions()}
            defaultCurrency={await getMainCurrency(context.organizationId)}
          />
        </SectionCard>
      ) : (
        <p className={`mt-6 ${cardClass} p-6`}>
          {INACTIVE_PRODUCT_COST_NOTICE}
        </p>
      )}

      <SectionCard
        id="historial-titulo"
        title="Historial de costos"
        icon="history"
        className="mt-6"
      >
        {history.total === 0 ? (
          <p>{NO_COSTS_MESSAGE}</p>
        ) : (
          <>
            <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Historial de costos de {product.name}
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
                      Costo
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
                        {entry.id === summary.cost?.id ? (
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
              aria-label={`Historial de costos de ${product.name}`}
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
                    {entry.id === summary.cost?.id ? " · vigente" : ""}
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
                pageSize: COSTS_PAGE_SIZE,
                shown: history.entries.length,
                total: history.total,
                singular: "costo",
                plural: "costos",
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
