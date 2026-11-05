import type { Metadata } from "next";
import Link from "next/link";
import {
  CASH_REFUNDS_PAGE_SIZE,
  listRefundClientOptions,
  listRefunds,
  type CashClientFilter,
  type CashClientOptions,
} from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inputClass,
  labelClass,
  linkClass,
  secondaryButtonClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatMoney } from "@/shared/money";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";
import {
  CONSUMER_TEXT,
  NO_REFUND_RESULTS_MESSAGE,
  NO_REFUNDS_MESSAGE,
  UNKNOWN_CLIENT_TEXT,
} from "@/app/(autenticado)/devoluciones/messages";
import { CashSubNav } from "../cash-sub-nav";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Devoluciones — AI WhatsApp Agent CRM",
};

const TITLE = "Devoluciones";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefFor(number: string, client: string, page: number): string {
  const params = new URLSearchParams();
  if (number) params.set("numero", number);
  if (client) params.set("cliente", client);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/caja/devoluciones?${query}` : "/caja/devoluciones";
}

// El mismo control que el de Cobros (D-1), con los clientes que tienen **devoluciones**: un filtro
// que ofrece clientes sin comprobantes haría elegir una opción que siempre devuelve la lista vacía.
function ClientFilter({
  options,
  value,
}: {
  options: CashClientOptions;
  value: string;
}) {
  if (options.kind === "text") {
    return (
      <div className="flex min-w-0 flex-col gap-1 sm:w-64">
        <label htmlFor="devoluciones-cliente" className={labelClass}>
          Cliente
        </label>
        <input
          id="devoluciones-cliente"
          name="cliente"
          type="search"
          defaultValue={value}
          placeholder="Nombre del cliente"
          className={inputClass}
        />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:w-64">
      <label htmlFor="devoluciones-cliente" className={labelClass}>
        Cliente
      </label>
      <select
        id="devoluciones-cliente"
        name="cliente"
        defaultValue={value}
        className={`${selectClass} w-full min-w-0`}
      >
        <option value="">Todos</option>
        {options.clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.displayName ?? UNKNOWN_CLIENT_TEXT}
          </option>
        ))}
        {/* El cliente que vino en la dirección y no tiene comprobantes, como en Cobros (N-9). */}
        {value !== "" &&
        !options.clients.some((client) => client.id === value) ? (
          <option value={value}>Un cliente sin comprobantes</option>
        ) : null}
      </select>
    </div>
  );
}

// Pantalla 34 (brief-21.5, D-9): las devoluciones, de la más nueva a la más vieja, con su origen (la
// cuenta del cliente o la venta), su cliente, su medio y su importe, y el estado de las anuladas;
// búsqueda por número («D-000007» o «7», ADR 0022, punto 11). Para los dos roles, sin el contacto del
// cliente. Como /caja/cobros, y desde la 24.7.2-b con **su mismo filtro por cliente** (D-0a) y la
// forma hermana del listado de la lámina 06. No tiene panel: el documento que la lámina 06 abre es
// el recibo, y la devolución conserva su pantalla.
export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const number = single(query.numero).slice(0, 40);
  const clientValue = single(query.cliente).slice(0, 80);
  const pageParam = single(query.pagina);
  const page = /^[1-9][0-9]{0,5}$/.test(pageParam) ? Number(pageParam) : 1;

  const chosen = await listRefundClientOptions(context);
  if (!chosen.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const options = chosen.options;
  const filter: CashClientFilter | null =
    clientValue === ""
      ? null
      : options.kind === "select"
        ? { kind: "id", id: clientValue }
        : { kind: "name", text: clientValue };

  const result = await listRefunds(context, { number, page, client: filter });
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const filtered = number !== "" || clientValue !== "";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title={TITLE}
        subtitle="Cada devolución de plata a un cliente, con su comprobante."
      />
      <CashSubNav current="devoluciones" />

      <form
        key={`${number}-${clientValue}`}
        method="get"
        action="/caja/devoluciones"
        className="mt-6 flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Buscar devoluciones"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="devoluciones-numero" className={labelClass}>
            Número D
          </label>
          <div className="relative">
            <input
              id="devoluciones-numero"
              name="numero"
              type="search"
              defaultValue={number}
              placeholder="D-000007"
              className={`${inputClass} pl-9`}
            />
            <SearchIcon />
          </div>
        </div>
        <ClientFilter options={options} value={clientValue} />
        <button type="submit" className={secondaryButtonClass}>
          Buscar
        </button>
      </form>

      {result.total === 0 ? (
        <EmptyState
          icon="undo"
          title={filtered ? NO_REFUND_RESULTS_MESSAGE : NO_REFUNDS_MESSAGE}
          description={
            filtered
              ? "Revisá el número, que se busca completo y con su serie, y el cliente elegido."
              : "Las devoluciones se registran desde la cuenta de un cliente o desde una venta anulada."
          }
          actions={
            filtered
              ? [
                  {
                    href: "/caja/devoluciones",
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : []
          }
          className="mt-6"
        />
      ) : (
        <>
          <div
            className={`mt-6 overflow-x-auto ${cardClass}`}
            tabIndex={0}
            role="region"
            aria-label={TITLE}
          >
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">{TITLE}</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Número D
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Cliente
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Desde
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Medio
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Importe
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      <Link
                        href={`/devoluciones/${refund.id}`}
                        className={`${linkClass} font-mono`}
                      >
                        {refund.displayNumber}
                      </Link>
                    </td>
                    <td className={tableCellClass}>
                      {refund.client === null
                        ? CONSUMER_TEXT
                        : (refund.client.displayName ?? UNKNOWN_CLIENT_TEXT)}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {refund.sale ? (
                        <>
                          Venta{" "}
                          <Link
                            href={`/ventas/${refund.sale.id}`}
                            className={`${linkClass} font-mono`}
                          >
                            {refund.sale.displayNumber}
                          </Link>
                        </>
                      ) : (
                        "Saldo a favor"
                      )}
                    </td>
                    <td className={tableCellClass}>
                      {refund.paymentMethodName}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(refund.amount, refund.currency)}
                      {/* Lo que salió en otra moneda, debajo del importe: la lámina dibuja un caso
                          sin conversión, y sacarlo dejaría la pantalla **sin decir qué salió de la
                          caja**. Va adentro de la celda, así que las seis columnas no cambian. */}
                      {refund.tender ? (
                        <span className="block text-xs font-normal text-muted">
                          {tenderNote(refund.tender, true)}
                        </span>
                      ) : null}
                    </td>
                    <td className={tableCellClass}>
                      {refund.voided ? (
                        <StatusBadge
                          tone="neutral"
                          icon="circleX"
                          title={`Anulada por ${refund.voided.displayNumber}`}
                        >
                          Anulada
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="success" icon="circleCheck">
                          Vigente
                        </StatusBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: CASH_REFUNDS_PAGE_SIZE,
              shown: result.refunds.length,
              total: result.total,
              singular: "devolución",
              plural: "devoluciones",
            })}
            hrefFor={(target) => hrefFor(number, clientValue, target)}
          />
        </>
      )}
    </main>
  );
}
