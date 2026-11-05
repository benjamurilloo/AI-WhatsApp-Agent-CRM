import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  CASH_RECEIPTS_PAGE_SIZE,
  getReceipt,
  listReceiptClientOptions,
  listReceipts,
  type CashClientFilter,
  type CashClientOptions,
} from "@/modules/cash";
import {
  getAppFrame,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  dangerOutlineLinkClass,
  inputClass,
  labelClass,
  linkClass,
  secondaryButtonClass,
  secondaryLinkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import {
  exchangeRateFromDatabase,
  formatExchangeRate,
  formatMoney,
} from "@/shared/money";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";
import { CashSubNav } from "../cash-sub-nav";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Cobros — AI WhatsApp Agent CRM",
};

const TITLE = "Cobros";
const NO_RECEIPTS_MESSAGE = "Todavía no se registró ningún cobro.";
const NO_RECEIPT_RESULTS_MESSAGE = "Ningún cobro coincide con ese filtro.";
const CONSUMER_TEXT = "Consumidor final";
const UNKNOWN_CLIENT_TEXT = "Cliente no disponible";
// «Registrar cobro» queda deshabilitado (brief-24.7.2-b, H-6; ya declarado por la 24.7.2): un cobro
// necesita un destino, y hoy se elige desde la venta, el pedido o la cuenta. El botón se dibuja
// como en la lámina, y **dice por qué**: un control apagado sin motivo es una trampa.
// ADR 0022, punto 11, como en el recibo entero.
const NOT_AN_INVOICE_LEGEND = "Documento no válido como factura";
const REGISTER_DISABLED_HINT =
  "Un cobro se registra desde su venta, su pedido o la cuenta del cliente: acá no hay a qué aplicarlo.";

type SearchParams = Record<string, string | string[] | undefined>;

type ReceiptsQuery = {
  number: string;
  client: string;
  page: number;
  receipt: string;
};

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// La dirección de la pantalla con todo lo que hay que conservar (D-3): el número, el cliente, la
// página y el recibo abierto. **Cerrar el panel tiene que devolver al listado donde estaba**, así
// que el panel no es un destino aparte: es un parámetro más de esta misma dirección.
function receiptsHref(query: Partial<ReceiptsQuery>): string {
  const params = new URLSearchParams();
  if (query.number) params.set("numero", query.number);
  if (query.client) params.set("cliente", query.client);
  if (query.page && query.page > 1) params.set("pagina", String(query.page));
  if (query.receipt) params.set("recibo", query.receipt);
  const search = params.toString();
  return search ? `/caja/cobros?${search}` : "/caja/cobros";
}

// El control del filtro «Cliente» (D-1): el `<select>` de la lámina con los clientes que tienen
// cobros, o el cuadro de texto cuando pasan el tope. **Lo decide el dato**, no el rol ni una
// preferencia. El `<select>` lleva `w-full min-w-0` obligatorio: su ancho mínimo es el de su opción
// más larga —413 px medidos en la 24.7.1— y sin eso desborda a 320 px.
function ClientFilter({
  options,
  value,
  id,
  name,
}: {
  options: CashClientOptions;
  value: string;
  id: string;
  name: string;
}) {
  if (options.kind === "text") {
    return (
      <div className="flex min-w-0 flex-col gap-1 sm:w-64">
        <label htmlFor={id} className={labelClass}>
          Cliente
        </label>
        <input
          id={id}
          name={name}
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
      <label htmlFor={id} className={labelClass}>
        Cliente
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className={`${selectClass} w-full min-w-0`}
      >
        <option value="">Todos</option>
        {options.clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.displayName ?? UNKNOWN_CLIENT_TEXT}
          </option>
        ))}
        {/* El cliente que vino en la dirección y **no tiene comprobantes**: sin esta opción el
            navegador deja «Todos» seleccionado y el control contradice a la lista, que está
            vacía. Lo encontró la revisión independiente (N-9). */}
        {value !== "" &&
        !options.clients.some((client) => client.id === value) ? (
          <option value={value}>Un cliente sin comprobantes</option>
        ) : null}
      </select>
    </div>
  );
}

// Pantalla 30 (brief-21.3, D-8): los cobros, del más nuevo al más viejo, con su destino, su cliente,
// su medio y su importe; búsqueda por número («R-000123» o «123», ADR 0022, punto 11). Para los dos
// roles, sin el contacto del cliente. Desde la 21.4, la columna del destino incluye el pedido de una
// seña (brief-21.4, D-8); desde la 21.5, el estado de las anuladas (brief-21.5, D-9); desde la 21.6,
// «A cuenta», con el enlace al estado de cuenta (brief-21.6, D-9).
//
// Desde la 24.7.2-b tiene la forma de la lámina 06 del lote V2-10: las seis columnas, el filtro por
// cliente (D-0a y D-1) y **el recibo en un panel que abre y cierra por la URL** (D-0b). La fecha
// sale de la tabla y vive en el panel, como dibuja la lámina.
export default async function ReceiptsPage({
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
  const open = single(query.recibo);

  // Las opciones primero: de su forma depende qué significa `?cliente=`. Son **dos cosas con dos
  // nombres** y no una cadena que el servicio adivine (D-1).
  const chosen = await listReceiptClientOptions(context);
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

  const [result, timeZone] = await Promise.all([
    listReceipts(context, { number, page, client: filter }),
    getOrganizationTimezone(context),
  ]);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const filtered = number !== "" || clientValue !== "";
  const base: ReceiptsQuery = {
    number,
    client: clientValue,
    page: result.page,
    receipt: "",
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <PageHeader
            title={TITLE}
            subtitle="Cada cobro de una venta, con su recibo."
          />
        </div>
        {context.role === "admin" ? (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled
              aria-describedby="registrar-cobro-ayuda"
              className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Registrar cobro
            </button>
            <p
              id="registrar-cobro-ayuda"
              className="max-w-xs text-right text-xs text-muted"
            >
              {REGISTER_DISABLED_HINT}
            </p>
          </div>
        ) : null}
      </div>
      <CashSubNav current="cobros" />

      <form
        key={`${number}-${clientValue}`}
        method="get"
        action="/caja/cobros"
        className="mt-6 flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Buscar cobros"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="cobros-numero" className={labelClass}>
            Número R
          </label>
          <div className="relative">
            <input
              id="cobros-numero"
              name="numero"
              type="search"
              defaultValue={number}
              placeholder="R-000123"
              className={`${inputClass} pl-9`}
            />
            <SearchIcon />
          </div>
        </div>
        <ClientFilter
          options={options}
          value={clientValue}
          id="cobros-cliente"
          name="cliente"
        />
        <button type="submit" className={secondaryButtonClass}>
          Buscar
        </button>
      </form>

      <div
        className={`mt-6 grid items-start gap-6 ${
          open === "" ? "" : "lg:grid-cols-[minmax(0,1fr)_22rem]"
        }`}
      >
        <div className="min-w-0 lg:order-first">
          {result.total === 0 ? (
            <EmptyState
              icon="receipt"
              title={
                filtered ? NO_RECEIPT_RESULTS_MESSAGE : NO_RECEIPTS_MESSAGE
              }
              description={
                filtered
                  ? "Revisá el número, que se busca completo y con su serie, y el cliente elegido."
                  : "Los cobros se registran desde una venta, un pedido o la cuenta de un cliente."
              }
              actions={
                filtered
                  ? [
                      {
                        href: "/caja/cobros",
                        label: "Limpiar filtros",
                        variant: "outline",
                      },
                    ]
                  : []
              }
            />
          ) : (
            <>
              <div
                className={`overflow-x-auto ${cardClass}`}
                tabIndex={0}
                role="region"
                aria-label={TITLE}
              >
                <table className="w-full border-collapse text-left text-[0.9375rem]">
                  <caption className="sr-only">{TITLE}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={tableHeadCellClass}>
                        Número R
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Cliente
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Destino
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
                    {result.receipts.map((receipt) => (
                      <tr
                        key={receipt.id}
                        className={
                          receipt.id === open ? "bg-primary-soft/40" : undefined
                        }
                      >
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          <Link
                            href={receiptsHref({
                              ...base,
                              receipt: receipt.id,
                            })}
                            aria-current={
                              receipt.id === open ? "true" : undefined
                            }
                            className={`${linkClass} font-mono`}
                          >
                            {receipt.displayNumber}
                          </Link>
                        </td>
                        <td className={tableCellClass}>
                          {receipt.client === null
                            ? CONSUMER_TEXT
                            : (receipt.client.displayName ??
                              UNKNOWN_CLIENT_TEXT)}
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          {receipt.sale ? (
                            <>
                              Venta{" "}
                              <Link
                                href={`/ventas/${receipt.sale.id}`}
                                className={`${linkClass} font-mono`}
                              >
                                {receipt.sale.displayNumber}
                              </Link>
                            </>
                          ) : receipt.order ? (
                            <>
                              Pedido{" "}
                              <Link
                                href={`/pedidos/${receipt.order.id}`}
                                className={`${linkClass} font-mono`}
                              >
                                {receipt.order.displayNumber}
                              </Link>
                            </>
                          ) : receipt.account ? (
                            <Link
                              href={`/clientes/${receipt.account.clientId}/cuenta`}
                              className={linkClass}
                            >
                              A cuenta
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={tableCellClass}>
                          {receipt.paymentMethodName}
                          {receipt.tradeIn ? (
                            <>
                              {" "}
                              <Link
                                href={`/usados/${receipt.tradeIn.id}`}
                                className={linkClass}
                              >
                                {receipt.tradeIn.displayNumber}
                              </Link>
                            </>
                          ) : null}
                        </td>
                        <td
                          className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                        >
                          {formatMoney(receipt.amount, receipt.currency)}
                          {/* Lo que entró en otra moneda, debajo del importe: la lámina dibuja el
                              caso con conversión en el panel, pero el listado tampoco puede dejar
                              de decir qué entró a la caja. Va adentro de la celda. */}
                          {receipt.tender ? (
                            <span className="block text-xs font-normal text-muted">
                              {tenderNote(receipt.tender)}
                            </span>
                          ) : null}
                        </td>
                        <td className={tableCellClass}>
                          {receipt.voided ? (
                            <StatusBadge
                              tone="neutral"
                              icon="circleX"
                              title={`Anulado por ${receipt.voided.displayNumber}`}
                            >
                              Anulado
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
                  pageSize: CASH_RECEIPTS_PAGE_SIZE,
                  shown: result.receipts.length,
                  total: result.total,
                  singular: "cobro",
                  plural: "cobros",
                })}
                hrefFor={(target) =>
                  receiptsHref({ ...base, page: target, receipt: open })
                }
              />
            </>
          )}
        </div>
        {/* `order-first` hasta `lg`: en pantalla angosta el panel va arriba de la tabla. */}
        <ReceiptPanel
          context={context}
          receiptId={open}
          timeZone={timeZone}
          closeHref={receiptsHref(base)}
          returnTo={receiptsHref({ ...base, receipt: open })}
        />
      </div>
    </main>
  );
}

// El recibo en un panel que abre y cierra por la URL (D-0b), como `?panel=cobro` de la 24.6.2-d.
// Vive **solo acá**: `/caja/devoluciones` no lee `?recibo=`, así que una dirección escrita a mano no
// lo dibuja en otra pantalla. Un id que no existe, o que no es de esta organización, **no dibuja
// nada**: el listado queda entero y no aparece un error de pantalla completa por un parámetro.
//
// No es un segundo comprobante: es un resumen. El comprobante imprimible sigue siendo `/cobros/[id]`,
// y «Imprimir» lleva ahí, que es lo que conserva **una sola** implementación de la impresión.
async function ReceiptPanel({
  context,
  receiptId,
  timeZone,
  closeHref,
  returnTo,
}: {
  context: AuthContext;
  receiptId: string;
  timeZone: string;
  closeHref: string;
  returnTo: string;
}) {
  if (receiptId === "") return null;
  const [found, frame] = await Promise.all([
    getReceipt(context, receiptId),
    getAppFrame(context),
  ]);
  if (!found.ok) return null;
  const receipt = found.receipt;
  const clientName =
    receipt.clientId === null
      ? CONSUMER_TEXT
      : (receipt.client?.displayName ?? UNKNOWN_CLIENT_TEXT);
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Cliente", value: clientName },
    {
      label: "Destino",
      value: receipt.sale ? (
        <Link
          href={`/ventas/${receipt.sale.id}`}
          className={`${linkClass} font-mono`}
        >
          Venta {receipt.sale.displayNumber}
        </Link>
      ) : receipt.order ? (
        <Link
          href={`/pedidos/${receipt.order.id}`}
          className={`${linkClass} font-mono`}
        >
          Pedido {receipt.order.displayNumber}
        </Link>
      ) : receipt.account ? (
        <Link
          href={`/clientes/${receipt.account.clientId}/cuenta`}
          className={linkClass}
        >
          A cuenta
        </Link>
      ) : (
        "—"
      ),
    },
    { label: "Medio", value: receipt.paymentMethodName },
    ...(receipt.session
      ? [
          {
            label: "Sesión de caja",
            value: (
              <Link
                href={`/caja/sesiones/${receipt.session.id}`}
                className={`${linkClass} font-mono`}
              >
                {receipt.session.displayNumber}
              </Link>
            ),
          },
        ]
      : []),
    {
      label: "Fecha",
      value: `${formatFullDateTime(receipt.createdAt, timeZone)} (${timeZone})`,
    },
  ];
  // La cotización solo si el cobro la tiene: uno en la misma moneda no tiene qué mostrar.
  const rate = receipt.tender
    ? formatExchangeRate(exchangeRateFromDatabase(receipt.tender.exchangeRate))
    : null;

  return (
    <aside
      aria-labelledby="recibo-panel-titulo"
      className={`${cardClass} order-first p-5 lg:order-none lg:sticky lg:top-6`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="recibo-panel-titulo"
            className="text-lg font-bold tracking-tight"
          >
            Recibo <span className="font-mono">{receipt.displayNumber}</span>
          </h2>
          <p className="mt-1">
            {receipt.voided ? (
              <StatusBadge
                tone="neutral"
                icon="circleX"
                title={`Anulado por ${receipt.voided.displayNumber}`}
              >
                Anulado
              </StatusBadge>
            ) : (
              <StatusBadge tone="success" icon="circleCheck">
                Vigente
              </StatusBadge>
            )}
          </p>
        </div>
        <Link
          href={closeHref}
          aria-label="Cerrar el recibo"
          className={`grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
        >
          <Icon name="close" className="size-4" />
        </Link>
      </div>

      <p className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2">
        <Icon name="smartphone" className="mt-0.5 size-5 shrink-0 text-muted" />
        <span>
          <span className="block font-semibold">{frame.organizationName}</span>
          <span className="block text-sm text-muted">
            {NOT_AN_INVOICE_LEGEND}
          </span>
        </span>
      </p>

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-3">
            <dt className="w-32 shrink-0 text-muted">{row.label}</dt>
            <dd className="min-w-0 font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 rounded-xl border border-border px-4 py-3">
        <p className="text-sm text-muted">
          {receipt.order
            ? "Seña del pedido:"
            : receipt.account
              ? "A cuenta del cliente:"
              : "Aplicado a la venta:"}
        </p>
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(receipt.amount, receipt.currency)}
        </p>
      </div>

      {receipt.tender ? (
        <>
          <div className="mt-3 rounded-xl border border-border px-4 py-3">
            <p className="text-sm text-muted">Recibido físicamente:</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatMoney(receipt.tender.amount, receipt.tender.currency)}
            </p>
          </div>
          <div className="mt-3 text-sm">
            <p className="text-muted">Cotización usada</p>
            <p className="tabular-nums">
              1 {receipt.currency} = {receipt.tender.currency} {rate} ·{" "}
              <span className="font-sans">
                {receipt.tender.negotiated
                  ? "acordada para este cobro"
                  : "copiada al registrar"}
              </span>
            </p>
          </div>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            <span>
              La deuda baja en {receipt.currency}; la caja recibe{" "}
              {receipt.tender.currency}.
            </span>
          </p>
        </>
      ) : null}

      {receipt.voided ? (
        <p className="mt-4 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm">
          Anulado por{" "}
          <span className="font-mono">{receipt.voided.displayNumber}</span> el{" "}
          {formatShortDateTime(receipt.voided.createdAt, timeZone)}. Ya no
          cuenta en lo cobrado.
        </p>
      ) : null}

      {/* D-2: sin menú de desborde. Las dos acciones están a la vista, al pie, y **ninguna
          necesita JavaScript**. Un menú «…» existe para esconder acciones cuando sobran, y acá
          hay dos. */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Link href={`/cobros/${receipt.id}`} className={secondaryLinkClass}>
          <Icon name="printer" className="size-4" />
          Imprimir
          <span className="sr-only"> el recibo completo</span>
        </Link>
        {context.role === "admin" && !receipt.voided ? (
          <Link
            href={`/cobros/${receipt.id}/anular?volver=${encodeURIComponent(returnTo)}`}
            className={dangerOutlineLinkClass}
          >
            Anular recibo
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
