import type { Metadata } from "next";
import Link from "next/link";
import { listProductPrices } from "@/modules/catalog";
import { getProductStock } from "@/modules/inventory";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  linkClass,
  noticeClass,
  pageTitleClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p>
        <Link href={`/productos/${product.id}`} className={linkClass}>
          Volver al producto
        </Link>
      </p>
      <h1 className={`mt-4 ${pageTitleClass}`}>{product.name}</h1>
      <p className="mt-1 text-muted">
        Precios · Precio vigente:{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {priceText(history.current)}
        </span>
      </p>

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <p className={noticeClass}>{notice}</p> : null}
      </div>

      {isAdmin ? (
        product.isActive ? (
          <section
            aria-labelledby="precio-titulo"
            className={`mt-6 ${cardClass} p-6`}
          >
            <h2 id="precio-titulo" className={sectionTitleClass}>
              Fijar precio
            </h2>
            <p className="mt-1 text-sm text-muted">
              El precio nuevo reemplaza al vigente y el anterior queda en el
              historial.
            </p>
            <PriceForm
              productId={product.id}
              current={history.current}
              currencies={currencyOptions()}
            />
          </section>
        ) : (
          <p className={`mt-6 ${cardClass} p-6`}>
            {INACTIVE_PRODUCT_PRICE_NOTICE}
          </p>
        )
      ) : null}

      <h2 className={`mt-8 ${sectionTitleClass}`}>Historial de precios</h2>

      {history.total === 0 ? (
        <p className={`mt-3 ${cardClass} p-6`}>{NO_PRICES_MESSAGE}</p>
      ) : (
        <>
          <div className={`mt-3 hidden overflow-hidden md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
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
                    <td className={`${tableCellClass} text-right tabular-nums`}>
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
            className="mt-3 flex flex-col gap-3 md:hidden"
          >
            {history.entries.map((entry) => (
              <li key={entry.id} className={`${cardClass} p-4`}>
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
        </>
      )}

      {history.pageCount > 1 ? (
        <nav
          aria-label="Paginación"
          className="mt-6 flex flex-wrap items-center justify-center gap-4"
        >
          {history.page > 1 ? (
            <Link href={pageHref(history.page - 1)} className={linkClass}>
              Página anterior
            </Link>
          ) : null}
          <p className="text-sm text-muted tabular-nums">
            Página {history.page} de {history.pageCount} · {history.total}{" "}
            {history.total === 1 ? "precio" : "precios"}
          </p>
          {history.page < history.pageCount ? (
            <Link href={pageHref(history.page + 1)} className={linkClass}>
              Página siguiente
            </Link>
          ) : null}
        </nav>
      ) : null}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
