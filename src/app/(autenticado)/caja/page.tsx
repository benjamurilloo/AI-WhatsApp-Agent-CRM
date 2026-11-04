import type { Metadata } from "next";
import Link from "next/link";
import { getCashState } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { getSupplierNames } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  linkClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryLinkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { ActionNotice } from "@/app/_components/action-notice";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatShortDateTime } from "@/app/_format/date-time";
import { CashSubNav } from "./cash-sub-nav";
import {
  CASH_CURRENCY_NOTE,
  CASH_NOTICE,
  CASH_VIEWER_DETAIL_NOTE,
  FORBIDDEN_PAGE_MESSAGE,
  noticeMessage,
  UNKNOWN_MEMBER_TEXT,
} from "./messages";
import { CurrencyTotalsTable, UnifiedMovementsTable } from "./session-tables";
import { ReferenceTotal } from "./reference-total";

export const metadata: Metadata = {
  title: "Caja — AI WhatsApp Agent CRM",
};

const TITLE = "Caja";

// Cuántos movimientos muestra la tarjeta antes de «Ver todos» (lámina 01).
const RECIENTES = 10;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Pantalla 21 (brief-21.2, D-10): el estado de la caja del efectivo. Abierta, su sesión con lo
// esperado por moneda y sus movimientos; admin registra movimientos y prepara el cierre. Cerrada, el
// enlace a la última sesión y, para admin, «Abrir caja». Un viewer ve lo mismo sin acciones.
//
// **Desde la 24.7.1 es la lámina 01** (brief-24.7.1). Lo que cambia es cómo se presenta lo que ya se
// leía; **ninguna regla de dinero y ninguna lectura**:
//
// - los totales van **por concepto**, con una columna por moneda, en vez de nueve columnas;
// - las **cinco tarjetas** de cobros, devoluciones, pagos de usados, pagos a proveedores y
//   aportes/retiros son **una sola lista** ordenada por hora (D-1);
// - las dos acciones viven en el encabezado, y «Registrar aporte» y «Registrar retiro» son **un
//   solo** «Registrar movimiento», con el tipo elegido en el formulario;
// - «Cerrar caja» pasa a llamarse **«Preparar cierre»**, que es lo que hace: lleva al conteo y no
//   cierra nada al tocarlo.
//
// **En pantalla chica, dos vistas** (D-4): «Resumen» y «Movimientos», con `?vista=`. Son enlaces y
// la decisión la toma el servidor, así que anda sin JavaScript; en pantalla grande se ven las dos y
// la barra de vistas no se dibuja.
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const state = await getCashState(context);
  if (!state.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const isAdmin = context.role === "admin";
  const timeZone = await getOrganizationTimezone(context);
  const notice = noticeMessage(CASH_NOTICE, query.aviso);
  const open = state.open;
  // Los nombres de los proveedores, solo si cash dio la lista: a un viewer no se la da.
  const supplierNames = open?.supplierPayments
    ? await getSupplierNames(
        context,
        open.supplierPayments.items.map((row) => row.supplierId),
      )
    : null;
  const names = supplierNames?.ok
    ? supplierNames.names
    : new Map<string, string>();
  const todos = first(query.movimientos) === "todos";
  const vista =
    first(query.vista) === "movimientos" ? "movimientos" : "resumen";
  // Un viewer no recibe el detalle de dos de las listas, y la pantalla lo dice (D-1).
  //
  // **El aviso se decide por el dato, no por el rol.** `supplierPayments` y `tradeInPayments` son
  // null para todo `viewer`, haya o no pagos; condicionarlo solo a eso le decía a un `viewer` que
  // se le ocultaban movimientos en una sesión que no tuvo ninguno —un aviso sin total que lo
  // respalde, que es el mismo defecto que D-1 vino a evitar, dado vuelta—. Los montos por moneda sí
  // le llegan, así que la pregunta correcta es si la sesión tuvo pagos, y la responde el mismo dato
  // con el que la tabla decide dibujar esas filas. Lo encontró la revisión independiente.
  const faltaDetalle =
    open !== null &&
    open.currencies.some(
      (row) =>
        (open.supplierPayments === null &&
          (row.supplierPayments !== "0.00" ||
            row.supplierPaymentVoids !== "0.00")) ||
        (open.tradeInPayments === null &&
          (row.tradeInPayments !== "0.00" ||
            row.tradeInPaymentVoids !== "0.00")),
    );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={pageTitleClass}>{TITLE}</h1>
          <p className={pageSubtitleClass}>El efectivo del negocio.</p>
        </div>
        {isAdmin && open ? (
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/caja/movimiento" className={primaryLinkClass}>
              <Icon name="plus" className="size-4" />
              Registrar movimiento
            </Link>
            <Link href="/caja/cerrar" className={secondaryLinkClass}>
              <Icon name="fileText" className="size-4" />
              Preparar cierre
            </Link>
          </div>
        ) : null}
      </div>

      <CashSubNav current="caja" />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {open ? (
        <>
          {/* La barra de vistas de la lámina 08: solo en pantalla chica. */}
          <nav
            aria-label="Vistas de la caja"
            className="mt-6 flex gap-2 sm:hidden"
          >
            {(
              [
                ["resumen", "Resumen"],
                ["movimientos", "Movimientos"],
              ] as const
            ).map(([clave, etiqueta]) => (
              <Link
                key={clave}
                // Cambiar de vista conserva si estabas viendo todos los movimientos.
                href={
                  clave === "resumen"
                    ? todos
                      ? "/caja?movimientos=todos"
                      : "/caja"
                    : todos
                      ? "/caja?vista=movimientos&movimientos=todos"
                      : "/caja?vista=movimientos"
                }
                aria-current={vista === clave ? "page" : undefined}
                className={
                  vista === clave ? primaryLinkClass : secondaryLinkClass
                }
              >
                {etiqueta}
              </Link>
            ))}
          </nav>

          <div className={vista === "resumen" ? "" : "max-sm:hidden"}>
            <SectionCard
              id="sesion-abierta-titulo"
              title={open.displayNumber}
              icon="banknote"
              className="mt-6"
            >
              <p className="-mt-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <StatusBadge tone="success" icon="circleCheck">
                  Abierta
                </StatusBadge>
                <span className="flex items-center gap-1.5">
                  <Icon name="calendar" className="size-4" />
                  {formatShortDateTime(open.openedAt, timeZone)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="user" className="size-4" />
                  {open.openedByName ?? UNKNOWN_MEMBER_TEXT}
                </span>
              </p>

              <CurrencyTotalsTable session={open} />
              <ReferenceTotal
                reference={open.reference}
                label="Equivalente orientativo"
                timeZone={timeZone}
              />
              <p className="mt-4 flex items-start gap-3 rounded-xl border border-border-strong bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                <span>{CASH_CURRENCY_NOTE}</span>
              </p>
            </SectionCard>
          </div>

          <div className={vista === "movimientos" ? "" : "max-sm:hidden"}>
            <SectionCard
              id="movimientos-titulo"
              title={todos ? "Movimientos" : "Movimientos recientes"}
              icon="list"
              className="mt-6"
              action={
                todos ? null : (
                  // **Lleva también la vista.** Sin eso, en un teléfono parado en
                  // «Movimientos», tocar «Ver todos» caía en «Resumen» y escondía justo la
                  // lista que venías a ver. En pantalla grande el parámetro no molesta,
                  // porque ahí se ven las dos.
                  <Link
                    href="/caja?vista=movimientos&movimientos=todos"
                    className={linkClass}
                  >
                    Ver todos
                  </Link>
                )
              }
            >
              <UnifiedMovementsTable
                session={open}
                timeZone={timeZone}
                supplierNames={names}
                limit={todos ? undefined : RECIENTES}
              />
              {faltaDetalle ? (
                <p className="mt-3 text-sm text-muted">
                  {CASH_VIEWER_DETAIL_NOTE}
                </p>
              ) : null}
            </SectionCard>
          </div>
        </>
      ) : (
        <div className={`mt-6 ${cardClass} flex flex-col gap-4 p-6`}>
          <p className="font-semibold">La caja está cerrada.</p>
          {state.last ? (
            <p className="text-sm">
              La última sesión fue{" "}
              <Link
                href={`/caja/sesiones/${state.last.id}`}
                className={`${linkClass} font-mono`}
              >
                {state.last.displayNumber}
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-muted">Todavía no se abrió nunca.</p>
          )}
          {isAdmin ? (
            <div>
              <Link href="/caja/abrir" className={primaryLinkClass}>
                <Icon name="banknote" className="size-4" />
                Abrir caja
              </Link>
            </div>
          ) : null}
        </div>
      )}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
