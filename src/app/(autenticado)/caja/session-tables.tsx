import Link from "next/link";
import type { CashSessionDetail } from "@/modules/cash";
import {
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatShortDateTime } from "@/app/_format/date-time";
import {
  formatMoney,
  moneyFromDatabase,
  moneyToDatabase,
} from "@/shared/money";
import { PAYMENT_VOID_REASON_LABEL } from "@/app/(autenticado)/compras/pagos/messages";
import { PAYMENT_VOID_REASON_LABEL as TRADE_IN_PAYMENT_VOID_REASON_LABEL } from "@/app/(autenticado)/usados/messages";
import { SupplierPaymentsTable } from "@/app/(autenticado)/compras/pagos/payments-table";
import {
  RECEIPT_VOID_REASON_LABEL,
  REFUND_VOID_REASON_LABEL,
  voidReasonText,
} from "@/app/(autenticado)/devoluciones/messages";
import {
  differenceText,
  KIND_LABEL,
  REASON_LABEL,
  UNKNOWN_MEMBER_TEXT,
} from "./messages";

// Los totales por moneda y los movimientos de una sesión (brief-21.2, D-10), para la caja abierta y
// para el arqueo de una cerrada. Cada moneda va en su fila: nunca se suman entre sí. Desde la 21.3,
// los cobros en efectivo: su columna en los totales y su lista (brief-21.3, D-5). Desde la 21.4, la
// lista dice el destino de cada cobro, la venta o el pedido de una seña, como /caja/cobros. Desde la
// 21.5 (brief-21.5, D-6 y D-9): los cobros y las devoluciones en efectivo de los totales van sin lo
// anulado mientras la sesión estaba abierta; las listas marcan lo anulado, y una sesión cerrada lista
// las anulaciones posteriores a su cierre, que explican su diferencia. Desde la 21.6, el destino de un
// cobro a cuenta es «A cuenta» (brief-21.6, D-9). Desde la 22.6 (brief-22.6, D-9; ADR 0023, punto 12): los
// pagos a proveedores en efectivo, sin lo anulado en la sesión, en su columna para los dos roles; su
// lista y sus anulaciones posteriores al cierre, solo para un admin: a un viewer cash no se las da.

// Lo que entró o salió, sin lo anulado en la sesión.
function net(amount: string, voided: string): string {
  return moneyToDatabase(moneyFromDatabase(amount) - moneyFromDatabase(voided));
}

function VoidedBadge({ displayNumber }: { displayNumber: string }) {
  return (
    <StatusBadge
      tone="neutral"
      icon="circleX"
      className="ml-2 font-sans"
      title={`Anulado por ${displayNumber}`}
    >
      Anulado
    </StatusBadge>
  );
}

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;
const numberHead = `${tableHeadCellClass} text-right`;

// **Los totales de la sesión, por concepto** (brief-24.7.1, lámina 01). Conceptos en las filas y
// una columna por moneda.
//
// **Estaba al revés hasta la 24.7.1**, y la transposición no es estética: los conceptos son **nueve
// y fijos**, y las monedas, una o dos. Con monedas en las filas la tabla medía nueve columnas y
// vivía dentro de un desplazamiento horizontal; así crece con lo que de verdad varía. La comparten
// la pantalla 21 y el arqueo de la 26, que además se imprime, y en papel el cambio es el mismo.
//
// Los signos se dibujan: lo que entra lleva «+» y lo que sale, «−». Antes los decía la posición de
// la columna, que en una fila por moneda se perdía de vista al desplazarse.

type ConceptoFila = {
  clave: string;
  etiqueta: string;
  // El signo que se dibuja delante del importe. Null en los que no son un movimiento: el inicial,
  // lo esperado, lo contado y la diferencia.
  signo: "+" | "−" | null;
  valor: (row: CashSessionDetail["currencies"][number]) => string | null;
  destacada?: boolean;
};

// Un importe con su signo, como la lámina. En cero no lleva signo: «+ 0,00» se lee como un
// movimiento que no existió.
function conSigno(
  valor: string,
  currency: string,
  signo: "+" | "−" | null,
): string {
  const texto = formatMoney(valor, currency);
  if (signo === null) return texto;
  if (/^-?0+([.,]0+)?$/.test(valor)) return texto;
  return `${signo} ${texto}`;
}

export function CurrencyTotalsTable({
  session,
}: {
  session: CashSessionDetail;
}) {
  const closed = session.closedAt !== null;
  // La fila de los pagos a proveedores, solo si la sesión tuvo alguno.
  const withPayments = session.currencies.some(
    (row) =>
      row.supplierPayments !== "0.00" || row.supplierPaymentVoids !== "0.00",
  );
  // La de los pagos de usados, igual (brief-29.7.2, D-5): sin trade_ins, nunca aparece.
  const withTradeInPayments = session.currencies.some(
    (row) =>
      row.tradeInPayments !== "0.00" || row.tradeInPaymentVoids !== "0.00",
  );

  const filas: ConceptoFila[] = [
    {
      clave: "inicial",
      etiqueta: "Inicial",
      signo: null,
      valor: (row) => row.initial,
    },
    {
      clave: "cobros",
      etiqueta: "Cobros en efectivo",
      signo: "+",
      valor: (row) => net(row.receipts, row.receiptVoids),
    },
    {
      clave: "aportes",
      etiqueta: "Aportes",
      signo: "+",
      valor: (row) => row.contributions,
    },
    {
      clave: "retiros",
      etiqueta: "Retiros",
      signo: "−",
      valor: (row) => row.withdrawals,
    },
    {
      clave: "devoluciones",
      etiqueta: "Devoluciones",
      signo: "−",
      valor: (row) => net(row.refunds, row.refundVoids),
    },
    ...(withPayments
      ? [
          {
            clave: "pagos-proveedores",
            etiqueta: "Pagos a proveedores",
            signo: "−" as const,
            valor: (row: CashSessionDetail["currencies"][number]) =>
              net(row.supplierPayments, row.supplierPaymentVoids),
          },
        ]
      : []),
    ...(withTradeInPayments
      ? [
          {
            clave: "pagos-usados",
            etiqueta: "Pagos de usados",
            signo: "−" as const,
            valor: (row: CashSessionDetail["currencies"][number]) =>
              net(row.tradeInPayments, row.tradeInPaymentVoids),
          },
        ]
      : []),
    {
      clave: "esperado",
      etiqueta: "Esperado",
      signo: null,
      valor: (row) => row.expected,
      destacada: true,
    },
    ...(closed
      ? [
          {
            clave: "contado",
            etiqueta: "Contado",
            signo: null,
            valor: (row: CashSessionDetail["currencies"][number]) =>
              row.counted,
          },
        ]
      : []),
  ];

  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Totales por moneda de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Totales por moneda de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Concepto
            </th>
            {session.currencies.map((row) => (
              <th
                key={row.currency}
                scope="col"
                className={`${numberHead} font-mono`}
              >
                {row.currency}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr
              key={fila.clave}
              className={fila.destacada ? "bg-primary-soft" : undefined}
            >
              <th
                scope="row"
                className={`${tableCellClass} ${fila.destacada ? "font-bold" : "font-normal"}`}
              >
                {fila.etiqueta}
              </th>
              {session.currencies.map((row) => {
                const valor = fila.valor(row);
                return (
                  <td
                    key={row.currency}
                    className={`${numberCell} ${fila.destacada ? "font-bold" : ""}`}
                  >
                    {valor === null
                      ? "—"
                      : conSigno(valor, row.currency, fila.signo)}
                  </td>
                );
              })}
            </tr>
          ))}
          {/* La diferencia va aparte: no es un importe suelto sino «Sobrante de» o «Faltante de»,
              y una moneda no compensa a la otra (brief-21.2, D-4). */}
          {closed ? (
            <tr>
              <th scope="row" className={`${tableCellClass} font-normal`}>
                Diferencia
              </th>
              {session.currencies.map((row) => (
                <td
                  key={row.currency}
                  className={`${numberCell} font-semibold`}
                >
                  {row.difference
                    ? differenceText(row.difference, row.currency)
                    : "—"}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

// **La lista unificada de movimientos de la sesión** (brief-24.7.1, lámina 01, D-1). Hasta la
// 24.7.1 la pantalla 21 tenía **cinco tarjetas separadas** —cobros, devoluciones, pagos de usados,
// pagos a proveedores y aportes/retiros—, y había que sumarlas de memoria para entender el día.
//
// **No es una lectura nueva**: `getCashState` ya devuelve las cinco listas en la misma lectura
// (`CashSessionDetail`). Esto es composición en la página, que es lo que esta fase permite.
//
// **Lo que la caja cuenta de una operación convertida es lo físico, no lo aplicado** (ADR 0025;
// brief-29.4, D-6): un cobro aplicado por USD 100 que recibió ARS 150.000 entra acá como
// ARS 150.000. La regla ya estaba escrita tres veces en este archivo, inline; ahora está una vez,
// en `cashSideOf`, y las tres tablas viejas la siguen usando igual.

type OperacionConvertible = {
  amount: string;
  currency: string;
  tender: { amount: string; currency: string } | null;
};

// Lo que entró o salió de la caja, en la moneda en la que entró o salió.
export function cashSideOf(row: OperacionConvertible): {
  amount: string;
  currency: string;
} {
  return row.tender ?? { amount: row.amount, currency: row.currency };
}

export type UnifiedMovement = {
  clave: string;
  at: Date;
  // El comprobante de la operación, con su enlace. Null en un aporte o un retiro, que no emiten uno.
  documento: { label: string; href: string } | null;
  concepto: string;
  currency: string;
  amount: string;
  signo: "+" | "−";
  anulado: string | null;
};

// A qué entró un cobro: la venta, el pedido de una seña, o la cuenta del cliente.
function destinoDelCobro(row: CashSessionDetail["receipts"][number]): string {
  if (row.sale) return `Cobro · Venta ${row.sale.displayNumber}`;
  if (row.order) return `Cobro · Pedido ${row.order.displayNumber}`;
  if (row.account) return "Cobro · A cuenta";
  return "Cobro";
}

// Todo lo que movió efectivo en la sesión, de lo más nuevo a lo más viejo.
//
// **Lo que un `viewer` no recibe no se inventa**: `supplierPayments` y `tradeInPayments` son null
// para él a propósito (brief-22.6, D-9), así que su lista sale más corta que la de un `admin`. La
// pantalla **lo dice** en vez de dejar que los totales no cierren con la lista: es el modo de falla
// que la 24.6.2-d pagó con un número que no coincidía con sus partes.
export function unifiedMovements(
  session: CashSessionDetail,
  supplierNames: Map<string, string>,
): UnifiedMovement[] {
  const filas: UnifiedMovement[] = [];

  for (const row of session.movements) {
    filas.push({
      clave: `m-${row.id}`,
      at: row.createdAt,
      documento: null,
      concepto: `${KIND_LABEL[row.kind]} · ${REASON_LABEL[row.reason]}`,
      currency: row.currency,
      amount: row.amount,
      signo: row.kind === "contribution" ? "+" : "−",
      anulado: null,
    });
  }

  for (const row of session.receipts) {
    const lado = cashSideOf(row);
    filas.push({
      clave: `r-${row.id}`,
      at: row.createdAt,
      documento: { label: row.displayNumber, href: `/cobros/${row.id}` },
      // **El destino va en el concepto.** La tarjeta que esta lista reemplaza tenía una columna
      // «Destino» desde la 21.4, porque de una seña lo que importa es a qué pedido entró. Sin esto,
      // unificar habría perdido ese dato; está en lo que `cash` ya devolvió, así que no cuesta una
      // lectura. El nombre del cliente sí la costaría, y por eso no está (V-6 del brief).
      concepto: destinoDelCobro(row),
      currency: lado.currency,
      amount: lado.amount,
      signo: "+",
      anulado: row.voided?.displayNumber ?? null,
    });
  }

  for (const row of session.refunds) {
    const lado = cashSideOf(row);
    filas.push({
      clave: `d-${row.id}`,
      at: row.createdAt,
      documento: { label: row.displayNumber, href: `/devoluciones/${row.id}` },
      concepto: "Devolución",
      currency: lado.currency,
      amount: lado.amount,
      signo: "−",
      anulado: row.voided?.displayNumber ?? null,
    });
  }

  for (const row of session.supplierPayments?.items ?? []) {
    const lado = cashSideOf(row);
    const nombre = supplierNames.get(row.supplierId);
    filas.push({
      clave: `pp-${row.id}`,
      at: row.createdAt,
      documento: {
        label: row.displayNumber,
        href: `/compras/pagos/${row.id}`,
      },
      concepto: nombre ? `Pago a ${nombre}` : "Pago a proveedor",
      currency: lado.currency,
      amount: lado.amount,
      signo: "−",
      anulado: row.voided?.displayNumber ?? null,
    });
  }

  for (const row of session.tradeInPayments?.items ?? []) {
    const lado = cashSideOf(row);
    filas.push({
      clave: `ppu-${row.id}`,
      at: row.createdAt,
      documento: { label: row.displayNumber, href: `/usados/pagos/${row.id}` },
      concepto: "Pago de usado",
      currency: lado.currency,
      amount: lado.amount,
      signo: "−",
      anulado: row.voided?.displayNumber ?? null,
    });
  }

  return filas.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function UnifiedMovementsTable({
  session,
  timeZone,
  supplierNames,
  limit,
}: {
  session: CashSessionDetail;
  timeZone: string;
  supplierNames: Map<string, string>;
  // Cuántas filas se muestran. Sin tope, todas: es lo que hace «Ver todos».
  limit?: number;
}) {
  const todas = unifiedMovements(session, supplierNames);
  if (todas.length === 0) {
    return <p className="text-sm text-muted">Todavía no hubo movimientos.</p>;
  }
  const filas = limit === undefined ? todas : todas.slice(0, limit);
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6"
      tabIndex={0}
      role="region"
      aria-label={`Movimientos de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Movimientos de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Fecha y hora
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Comprobante
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Concepto
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Moneda
            </th>
            <th scope="col" className={numberHead}>
              Importe
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.clave}>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(fila.at, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {fila.documento ? (
                  <Link
                    href={fila.documento.href}
                    className={`${linkClass} font-mono`}
                  >
                    {fila.documento.label}
                  </Link>
                ) : (
                  <span className="text-muted">—</span>
                )}
                {fila.anulado ? (
                  <span className="ml-2 inline-block">
                    <VoidedBadge displayNumber={fila.anulado} />
                  </span>
                ) : null}
              </td>
              <td className={tableCellClass}>{fila.concepto}</td>
              <td className={`${tableCellClass} font-mono`}>{fila.currency}</td>
              <td className={numberCell}>
                {fila.signo} {formatMoney(fila.amount, fila.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MovementsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  if (session.movements.length === 0) {
    return <p className="text-sm text-muted">Sin aportes ni retiros.</p>;
  }
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Movimientos de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Movimientos de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Hora
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Tipo
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Motivo
            </th>
            <th scope="col" className={numberHead}>
              Monto
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Registró
            </th>
          </tr>
        </thead>
        <tbody>
          {session.movements.map((row) => (
            <tr key={row.id}>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={tableCellClass}>{KIND_LABEL[row.kind]}</td>
              <td className={tableCellClass}>{REASON_LABEL[row.reason]}</td>
              <td className={numberCell}>
                {row.kind === "withdrawal" ? "− " : "+ "}
                {formatMoney(row.amount, row.currency)}
              </td>
              <td className={tableCellClass}>
                {row.createdByName ?? UNKNOWN_MEMBER_TEXT}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SessionReceiptsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  if (session.receipts.length === 0) {
    return <p className="text-sm text-muted">Sin cobros en efectivo.</p>;
  }
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Cobros en efectivo de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Cobros en efectivo de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Recibo
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Hora
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Destino
            </th>
            <th scope="col" className={numberHead}>
              Monto
            </th>
          </tr>
        </thead>
        <tbody>
          {session.receipts.map((row) => (
            <tr key={row.id}>
              <td className={tableCellClass}>
                <Link
                  href={`/cobros/${row.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.displayNumber}
                </Link>
                {row.voided ? (
                  <VoidedBadge displayNumber={row.voided.displayNumber} />
                ) : null}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {row.sale ? (
                  <>
                    Venta{" "}
                    <Link
                      href={`/ventas/${row.sale.id}`}
                      className={`${linkClass} font-mono print:no-underline`}
                    >
                      {row.sale.displayNumber}
                    </Link>
                  </>
                ) : row.order ? (
                  <>
                    Pedido{" "}
                    <Link
                      href={`/pedidos/${row.order.id}`}
                      className={`${linkClass} font-mono print:no-underline`}
                    >
                      {row.order.displayNumber}
                    </Link>
                  </>
                ) : row.account ? (
                  <Link
                    href={`/clientes/${row.account.clientId}/cuenta`}
                    className={`${linkClass} print:no-underline`}
                  >
                    A cuenta
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className={numberCell}>
                {/* En la caja, lo que entró: lo recibido si fue en otra moneda (brief-29.4, D-7). */}
                {row.tender
                  ? formatMoney(row.tender.amount, row.tender.currency)
                  : formatMoney(row.amount, row.currency)}
                {row.tender ? (
                  <span className="block text-xs text-muted">
                    Aplicado: {formatMoney(row.amount, row.currency)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SessionRefundsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  if (session.refunds.length === 0) {
    return <p className="text-sm text-muted">Sin devoluciones en efectivo.</p>;
  }
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Devoluciones en efectivo de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Devoluciones en efectivo de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Devolución
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Hora
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Desde
            </th>
            <th scope="col" className={numberHead}>
              Monto
            </th>
          </tr>
        </thead>
        <tbody>
          {session.refunds.map((row) => (
            <tr key={row.id}>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                <Link
                  href={`/devoluciones/${row.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.displayNumber}
                </Link>
                {row.voided ? (
                  <VoidedBadge displayNumber={row.voided.displayNumber} />
                ) : null}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {row.sale ? (
                  <>
                    Venta{" "}
                    <Link
                      href={`/ventas/${row.sale.id}`}
                      className={`${linkClass} font-mono print:no-underline`}
                    >
                      {row.sale.displayNumber}
                    </Link>
                  </>
                ) : (
                  "Saldo a favor"
                )}
              </td>
              <td className={numberCell}>
                {/* En la caja, lo que salió: en la otra moneda si fue en ella (brief-29.4.3, D-5). */}
                {row.tender
                  ? formatMoney(row.tender.amount, row.tender.currency)
                  : formatMoney(row.amount, row.currency)}
                {row.tender ? (
                  <span className="block text-xs text-muted">
                    Aplicado: {formatMoney(row.amount, row.currency)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Las anulaciones posteriores al cierre (ADR 0022, punto 7; brief-21.5, D-6): el arqueo guardado no
// cambia, y estas explican su diferencia. Solo en una sesión cerrada.
export function LateVoidsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  if (session.lateVoids.length === 0) return null;
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Anulaciones posteriores al cierre de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Anulaciones posteriores al cierre de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Anulación
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Fecha
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Anula
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Motivo
            </th>
            <th scope="col" className={numberHead}>
              Efecto en esta caja
            </th>
          </tr>
        </thead>
        <tbody>
          {session.lateVoids.map((row) => (
            <tr key={row.displayNumber}>
              <td className={`${tableCellClass} font-mono whitespace-nowrap`}>
                {row.displayNumber}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {row.kind === "receipt" ? "Recibo" : "Devolución"}{" "}
                <Link
                  href={
                    row.kind === "receipt"
                      ? `/cobros/${row.source.id}`
                      : `/devoluciones/${row.source.id}`
                  }
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.source.displayNumber}
                </Link>
              </td>
              <td className={tableCellClass}>
                {voidReasonText(
                  row.kind === "receipt"
                    ? RECEIPT_VOID_REASON_LABEL
                    : REFUND_VOID_REASON_LABEL,
                  row.reason,
                )}
              </td>
              <td className={numberCell}>
                {/* Un cobro anulado no entró: lo contado tuvo eso de más. Una devolución anulada no
                    salió: lo contado tuvo eso de menos. */}
                {row.kind === "receipt" ? "− " : "+ "}
                {formatMoney(row.amount, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Las anulaciones posteriores al cierre de los pagos a proveedores en efectivo de la sesión (brief-22.6,
// D-9): solo las recibe un admin. Un pago anulado no salió: lo contado tuvo eso de más.
export function LateSupplierPaymentVoidsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  const rows = session.supplierPayments?.lateVoids ?? [];
  if (rows.length === 0) return null;
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Pagos a proveedores anulados después del cierre de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Pagos a proveedores anulados después del cierre de la sesión{" "}
          {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Anulación
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Fecha
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Anula
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Motivo
            </th>
            <th scope="col" className={numberHead}>
              Efecto en esta caja
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.displayNumber}>
              <td className={`${tableCellClass} font-mono whitespace-nowrap`}>
                {row.displayNumber}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                Pago{" "}
                <Link
                  href={`/compras/pagos/${row.source.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.source.displayNumber}
                </Link>
              </td>
              <td className={tableCellClass}>
                {PAYMENT_VOID_REASON_LABEL[row.reason]}
              </td>
              <td className={numberCell}>
                + {formatMoney(row.amount, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Los pagos a proveedores en efectivo de la sesión (brief-22.6, D-9): solo un admin los recibe. El
// nombre del proveedor lo compone la página con purchasing.
export function SessionSupplierPaymentsTable({
  session,
  timeZone,
  supplierNames,
}: {
  session: CashSessionDetail;
  timeZone: string;
  supplierNames: Map<string, string>;
}) {
  const items = session.supplierPayments?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">Sin pagos a proveedores en efectivo.</p>
    );
  }
  return (
    <SupplierPaymentsTable
      cashSide
      caption={`Pagos a proveedores en efectivo de la sesión ${session.displayNumber}`}
      payments={items}
      timeZone={timeZone}
      supplierNames={supplierNames}
    />
  );
}

// Los pagos de usados en efectivo de la sesión (brief-29.7.2, D-5): solo un admin los recibe.
export function SessionTradeInPaymentsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  const items = session.tradeInPayments?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Pagos de usados en efectivo de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Pagos de usados en efectivo de la sesión {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Pago
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Fecha
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Usado
            </th>
            <th scope="col" className={numberHead}>
              Salió de la caja
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                <Link
                  href={`/usados/pagos/${row.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.displayNumber}
                </Link>
                {row.voided ? (
                  <>
                    {" "}
                    <VoidedBadge displayNumber={row.voided.displayNumber} />
                  </>
                ) : null}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {row.tradeIn ? (
                  <Link
                    href={`/usados/${row.tradeIn.id}`}
                    className={`${linkClass} font-mono print:no-underline`}
                  >
                    {row.tradeIn.displayNumber}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className={numberCell}>
                {row.tender
                  ? formatMoney(row.tender.amount, row.tender.currency)
                  : formatMoney(row.amount, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Las anulaciones posteriores al cierre de los pagos de usados en efectivo de la sesión (brief-29.7.2,
// D-5): solo las recibe un admin. Un pago anulado no salió: lo contado tuvo eso de más.
export function LateTradeInPaymentVoidsTable({
  session,
  timeZone,
}: {
  session: CashSessionDetail;
  timeZone: string;
}) {
  const rows = session.tradeInPayments?.lateVoids ?? [];
  if (rows.length === 0) return null;
  return (
    <div
      className="-mx-5 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
      tabIndex={0}
      role="region"
      aria-label={`Pagos de usados anulados después del cierre de la sesión ${session.displayNumber}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Pagos de usados anulados después del cierre de la sesión{" "}
          {session.displayNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={tableHeadCellClass}>
              Anulación
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Fecha
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Anula
            </th>
            <th scope="col" className={tableHeadCellClass}>
              Motivo
            </th>
            <th scope="col" className={numberHead}>
              Efecto en esta caja
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.displayNumber}>
              <td className={`${tableCellClass} font-mono whitespace-nowrap`}>
                {row.displayNumber}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                {formatShortDateTime(row.createdAt, timeZone)}
              </td>
              <td className={`${tableCellClass} whitespace-nowrap`}>
                Pago{" "}
                <Link
                  href={`/usados/pagos/${row.source.id}`}
                  className={`${linkClass} font-mono print:no-underline`}
                >
                  {row.source.displayNumber}
                </Link>
              </td>
              <td className={tableCellClass}>
                {TRADE_IN_PAYMENT_VOID_REASON_LABEL[row.reason]}
              </td>
              <td className={numberCell}>
                + {formatMoney(row.amount, row.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
