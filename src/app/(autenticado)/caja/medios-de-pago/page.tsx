import type { Metadata } from "next";
import Link from "next/link";
import {
  INITIAL_PAYMENT_METHODS,
  listPaymentMethods,
  MAX_ACTIVE_PAYMENT_METHODS,
} from "@/modules/cash";
import { requireSession } from "@/app/_auth/session";
import {
  activeBadgeClass,
  cardClass,
  dangerOutlineLinkClass,
  inactiveBadgeClass,
  roleBadgeClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { ActionNotice } from "@/app/_components/action-notice";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { CashSubNav } from "../cash-sub-nav";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_PAYMENT_METHODS_MESSAGE,
  noticeMessage,
  PAYMENT_METHOD_NOTICE,
} from "../messages";
import {
  DeactivatePaymentMethodConfirm,
  InitialPaymentMethodsForm,
  ReactivatePaymentMethodForm,
} from "./payment-method-actions";
import { PaymentMethodForm } from "./payment-method-form";

export const metadata: Metadata = {
  title: "Medios de pago — AI WhatsApp Agent CRM",
};

const TITLE = "Medios de pago";
const SUBTITLE =
  "Con qué se registra cada cobro, cada pago y cada movimiento. Lo que el agente dice que aceptás sigue en la información del negocio.";
// El «+» forma parte del nombre del enlace desde la Fase 4 (ver `page-header.tsx`), y la lámina
// también lo dibuja. Lo señaló la revisión independiente de la 24.7.3 (N-4).
const NEW_METHOD_LINK = "+ Nuevo medio";
const CLOSE_PANEL_LABEL = "Cerrar el panel del medio de pago";
// El aviso al pie (brief-24.7.3, D-5): las explicaciones que estaban en una celda por fila, dichas
// una sola vez. La de «Permuta» **se dibuja solo si la fila existe**; la lámina también tiene una
// de «USDT», que **no se dibuja nunca**, porque USDT es un medio ordinario del ejemplo y no una
// regla del producto: una organización puede no haberlo creado.
const CASH_FOOTER_TEXT =
  "Efectivo entra a la caja de la sesión y cuenta en su arqueo. No efectivo queda en el comprobante, sin sumar billetes.";
const TRADE_IN_FOOTER_TEXT =
  "Permuta se usa solo en cobros de ventas con un usado elegible: descuenta el usado y no pasa por la caja.";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Pantalla 27 (brief-21.2, D-6 y D-10): la lista de con qué se registra un cobro. Un admin crea,
// renombra, desactiva con confirmación y reactiva; con la lista vacía, crea la inicial. Un viewer la
// ve sin acciones. No es lo que lee el agente: eso sigue en la información del negocio (punto 10).
//
// *Desde la 24.7.3* ([brief-24.7.3](../../../../docs/decisions/brief-24.7.3-cotizacion-y-medios-de-pago.md);
// lámina 01 del lote 24-medios-pago): la forma de la lámina. **Ninguna regla cambió y no hay
// ninguna lectura nueva**: `listPaymentMethods` devuelve lo mismo que antes.
//
// - El encabezado es de la pantalla, no de la caja, y lleva el botón primario «Nuevo medio».
// - La columna «Caja», que tenía una frase por fila, es «Tipo» con una palabra, y las frases
//   bajan al aviso al pie (D-5).
// - El alta y el renombre son **un panel que abre y cierra por la URL** (D-3), el mismo patrón del
//   recibo de la 24.7.2-b: el renombre ya se manejaba por `?editar=<id>`, así que lo único que
//   cambia es dónde se dibuja.
export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const result = await listPaymentMethods(context);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const isAdmin = context.role === "admin";
  const methods = result.paymentMethods;
  // «Permuta» es un medio del sistema (brief-29.7.2, D-1): no se renombra ni se desactiva, y no cuenta
  // para la lista inicial.
  const editable = methods.filter((method) => method.systemRole === null);
  const editing = isAdmin
    ? editable.find((method) => method.id === single(query.editar))
    : undefined;
  const confirming = isAdmin
    ? editable.find(
        (method) => method.isActive && method.id === single(query.confirmar),
      )
    : undefined;
  const creating = isAdmin && !editing && single(query.nuevo) === "1";
  const panel = editing ? "editar" : creating ? "nuevo" : null;
  const notice = noticeMessage(PAYMENT_METHOD_NOTICE, query.aviso);
  const hasTradeIn = methods.some((method) => method.systemRole === "trade_in");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title={TITLE}
        subtitle={SUBTITLE}
        action={
          isAdmin && !panel
            ? { href: "/caja/medios-de-pago?nuevo=1", label: NEW_METHOD_LINK }
            : null
        }
      />
      <CashSubNav current="medios" />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <div
        className={`mt-6 grid items-start gap-6 ${
          panel ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""
        }`}
      >
        <div className="flex min-w-0 flex-col gap-6">
          {isAdmin && editable.length === 0 ? (
            <SectionCard
              id="lista-inicial-titulo"
              title="Empezá con la lista inicial"
              description="Cuatro medios para el día a día. Después podés renombrarlos, desactivarlos o sumar otros."
              icon="creditCard"
            >
              <ul aria-label="Lista inicial" className="flex flex-wrap gap-2">
                {INITIAL_PAYMENT_METHODS.map((method) => (
                  <li key={method.name} className={roleBadgeClass}>
                    {method.name}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <InitialPaymentMethodsForm />
              </div>
            </SectionCard>
          ) : null}

          {confirming ? (
            <DeactivatePaymentMethodConfirm
              paymentMethodId={confirming.id}
              name={confirming.name}
            />
          ) : null}

          {methods.length === 0 ? (
            <EmptyState
              icon="creditCard"
              title={NO_PAYMENT_METHODS_MESSAGE}
              description="Los medios de pago son los que se eligen al cobrar y al pagar."
            />
          ) : (
            <>
              <div
                // `relative` acota los `sr-only` de las acciones: son `position: absolute`, y sin un
                // ancestro posicionado su caja cuenta contra el ancho de desplazamiento del documento,
                // así que la tabla desbordaba la página en vez de desplazarse dentro de su marco.
                className={`relative min-w-0 overflow-x-auto ${cardClass}`}
                tabIndex={0}
                role="region"
                aria-label={TITLE}
              >
                <table className="w-full border-collapse text-left text-[0.9375rem]">
                  <caption className="sr-only">{TITLE}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={tableHeadCellClass}>
                        Nombre
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Tipo
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Estado
                      </th>
                      {isAdmin ? (
                        <th scope="col" className={tableHeadCellClass}>
                          Acciones
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {methods.map((method) => (
                      <tr key={method.id}>
                        <td className={`${tableCellClass} font-semibold`}>
                          {method.name}
                        </td>
                        {/* Una palabra por fila: lo que explicaba la frase larga está en el
                            aviso al pie (D-5). «Del sistema» deja de ser un rótulo debajo del
                            nombre y pasa a ser lo que es, el tipo del medio. */}
                        <td className={tableCellClass}>
                          {method.systemRole !== null
                            ? "Del sistema"
                            : method.isCash
                              ? "Efectivo"
                              : "No efectivo"}
                        </td>
                        <td className={tableCellClass}>
                          <span
                            className={
                              method.isActive
                                ? activeBadgeClass
                                : inactiveBadgeClass
                            }
                          >
                            {method.isActive ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        {isAdmin ? (
                          <td className={tableCellClass}>
                            {method.systemRole !== null ? (
                              // El bloqueo lleva nombre, no solo un candado (README del lote).
                              <span className="inline-flex items-center gap-2 text-sm text-muted">
                                <Icon name="lock" className="size-4" />
                                Sin edición
                                <span className="sr-only">
                                  : {method.name} no se renombra ni se desactiva
                                </span>
                              </span>
                            ) : method.isActive ? (
                              <div className="flex flex-wrap gap-2">
                                <Link
                                  href={`/caja/medios-de-pago?editar=${method.id}`}
                                  className={secondaryLinkClass}
                                >
                                  <Icon name="pencil" className="size-4" />
                                  Renombrar
                                  <span className="sr-only">
                                    {" "}
                                    {method.name}
                                  </span>
                                </Link>
                                <Link
                                  href={`/caja/medios-de-pago?confirmar=${method.id}`}
                                  className={dangerOutlineLinkClass}
                                >
                                  <Icon name="power" className="size-4" />
                                  Desactivar
                                  <span className="sr-only">
                                    {" "}
                                    {method.name}
                                  </span>
                                </Link>
                              </div>
                            ) : (
                              <ReactivatePaymentMethodForm
                                paymentMethodId={method.id}
                                name={method.name}
                              />
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm">
                <Icon
                  name="info"
                  className="mt-0.5 size-5 shrink-0 text-muted"
                />
                <div className="min-w-0">
                  <p>{CASH_FOOTER_TEXT}</p>
                  {hasTradeIn ? (
                    <p className="mt-1">{TRADE_IN_FOOTER_TEXT}</p>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>

        {panel ? (
          <aside
            aria-labelledby="medio-panel-titulo"
            className={`${cardClass} order-first min-w-0 p-5 lg:order-none lg:sticky lg:top-6`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="medio-panel-titulo"
                className="min-w-0 text-lg font-bold tracking-tight"
              >
                {editing
                  ? `Renombrar «${editing.name}»`
                  : "Nuevo medio de pago"}
              </h2>
              <Link
                href="/caja/medios-de-pago"
                aria-label={CLOSE_PANEL_LABEL}
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <Icon name="close" className="size-4" />
              </Link>
            </div>
            <p className="mt-2 text-sm text-muted">
              {editing
                ? "El tipo no se cambia: un cobro anterior no cambia de caja."
                : `Hasta ${MAX_ACTIVE_PAYMENT_METHODS} activos.`}
            </p>
            <div className="mt-4">
              {editing ? (
                <PaymentMethodForm
                  mode="editar"
                  paymentMethodId={editing.id}
                  values={{ name: editing.name, isCash: editing.isCash }}
                />
              ) : (
                <PaymentMethodForm mode="crear" />
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
