import Link from "next/link";
import {
  getGoodsReceiptPaymentForm,
  getSupplierPayment,
  type SupplierPaymentDetail,
} from "@/modules/cash";
import type { AuthContext } from "@/modules/organizations";
import { getSupplier } from "@/modules/purchasing";
import {
  cardClass,
  dangerOutlineLinkClass,
  linkClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
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
import { UNKNOWN_SUPPLIER_TEXT } from "../ordenes/messages";
import {
  ACCOUNT_TARGET_TEXT,
  NOT_A_TRANSFER_NOTE,
  PANEL_RATE_NOTE,
  panelCashNote,
  VOIDED_BADGE_TEXT,
} from "./messages";

// El detalle del pago en un panel que abre y cierra por la URL (brief-24.8.2, D-2 y lámina 08), con
// el molde de la 24.7.2-b: vive **solo en esta lista** —ninguna otra pantalla lee `?pago=`—, un id
// que no existe o que no es de la organización **no dibuja nada**, y cerrar devuelve al listado con
// los filtros y la página donde estaban.
//
// No es un segundo comprobante: es un resumen. El comprobante imprimible sigue siendo
// `/compras/pagos/[id]` (ADR 0023, punto 13) y «Imprimir» lleva ahí, que es lo que conserva **una
// sola** implementación de la impresión.
export async function SupplierPaymentPanel({
  context,
  paymentId,
  timeZone,
  closeHref,
}: {
  context: AuthContext;
  paymentId: string;
  timeZone: string;
  closeHref: string;
}) {
  if (paymentId === "") return null;
  const found = await getSupplierPayment(context, paymentId);
  if (!found.ok) return null;
  const payment = found.payment;
  // D-3: el estado de la recepción sale de la **misma cuenta** que limita el pago, así que las tres
  // cifras no pueden contradecir a la recepción. Un pago a cuenta no tiene recepción: no va.
  // El nombre lo trae purchasing, y lo pide el panel y no la lista: el pago abierto puede no estar
  // entre las filas que se ven —otra página, u otro filtro— y entonces su nombre no estaría.
  const [standing, supplier] = await Promise.all([
    payment.goodsReceipt
      ? getGoodsReceiptPaymentForm(context, payment.goodsReceipt.id)
      : null,
    getSupplier(context, payment.supplierId),
  ]);
  const supplierName = supplier.ok ? supplier.supplier.name : null;

  return (
    <aside
      aria-labelledby="pago-panel-titulo"
      className={`${cardClass} order-first w-full p-5 lg:order-none lg:w-[22rem] lg:shrink-0 lg:sticky lg:top-6`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="pago-panel-titulo"
            className="text-lg font-bold tracking-tight"
          >
            Pago <span className="font-mono">{payment.displayNumber}</span>
          </h2>
          <p className="mt-1">
            {payment.voided ? (
              <StatusBadge
                tone="neutral"
                icon="circleX"
                title={`Anulado por ${payment.voided.displayNumber}`}
              >
                {VOIDED_BADGE_TEXT}
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
          aria-label="Cerrar el pago"
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Icon name="close" className="size-4" />
        </Link>
      </div>

      <p className="mt-4 min-w-0">
        <Link
          href={`/compras/proveedores/${payment.supplierId}`}
          className={`${linkClass} text-lg font-semibold`}
        >
          {supplierName ?? UNKNOWN_SUPPLIER_TEXT}
        </Link>
        <span className="block text-sm text-muted">Proveedor</span>
      </p>

      <h3 className="mt-5 border-t border-border pt-4 text-sm font-semibold">
        Información general
      </h3>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted">Destino</dt>
          <dd className="font-semibold">
            {payment.goodsReceipt ? (
              <Link
                href={`/compras/recepciones/${payment.goodsReceipt.id}`}
                className={`${linkClass} font-mono`}
              >
                {payment.goodsReceipt.displayNumber}
              </Link>
            ) : (
              ACCOUNT_TARGET_TEXT
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Fecha y hora</dt>
          <dd className="font-semibold">
            {formatFullDateTime(payment.createdAt, timeZone)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Medio de pago</dt>
          <dd className="font-semibold">{payment.paymentMethodName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Registrado por</dt>
          <dd className="font-semibold">
            {payment.createdByName ?? "Usuario no disponible"}
          </dd>
        </div>
        {payment.session ? (
          <div className="min-w-0">
            <dt className="text-muted">Sesión de caja</dt>
            <dd className="font-semibold">
              <Link
                href={`/caja/sesiones/${payment.session.id}`}
                className={`${linkClass} font-mono`}
              >
                {payment.session.displayNumber}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>

      <h3 className="mt-5 border-t border-border pt-4 text-sm font-semibold">
        Detalle del pago
      </h3>
      <PaymentAmounts payment={payment} />

      {standing?.ok ? (
        <>
          <h3 className="mt-5 border-t border-border pt-4 text-sm font-semibold">
            Estado de la recepción
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-muted">Monto total</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(
                  standing.form.receipt.total,
                  standing.form.receipt.currency,
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted">Pagado</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(
                  standing.form.paid,
                  standing.form.receipt.currency,
                )}
              </dd>
            </div>
            {standing.form.imputed === "0.00" ? null : (
              <div className="min-w-0">
                <dt className="text-muted">Imputado desde la cuenta</dt>
                <dd className="tabular-nums">
                  {formatMoney(
                    standing.form.imputed,
                    standing.form.receipt.currency,
                  )}
                </dd>
              </div>
            )}
            <div className="min-w-0">
              <dt className="text-muted">Restante</dt>
              <dd className="text-lg font-bold tabular-nums">
                {formatMoney(
                  standing.form.outstanding,
                  standing.form.receipt.currency,
                )}
              </dd>
            </div>
          </dl>
          {standing.form.receipt.voided ? (
            <p className="mt-3 text-sm text-muted">
              La recepción está anulada: no queda nada por pagar en ella y lo
              pagado quedó a favor en la cuenta del proveedor.
            </p>
          ) : null}
        </>
      ) : null}

      <p className="mt-5 flex items-start gap-3 border-t border-border pt-4 text-sm">
        <Icon name="fileText" className="mt-0.5 size-5 shrink-0 text-muted" />
        <span>
          <span className="font-semibold">Nota</span>{" "}
          {panelCashNote(payment.isCash, payment.session)}
        </span>
      </p>

      <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        <span>
          {NOT_A_TRANSFER_NOTE}
          {payment.tender ? ` ${PANEL_RATE_NOTE}` : ""}
        </span>
      </p>

      {payment.voided ? (
        <p className="mt-4 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm">
          Anulado por{" "}
          <Link
            href={`/compras/pagos/${payment.id}/anulacion`}
            className={`${linkClass} font-mono`}
          >
            {payment.voided.displayNumber}
          </Link>{" "}
          el {formatShortDateTime(payment.voided.createdAt, timeZone)}. Ya no
          cuenta en lo pagado.
        </p>
      ) : null}

      {/* V-7: sin menú «⋮». Un menú así es un popover y necesita JavaScript (D-2 de la 24.7.2-b);
          acá hay dos acciones y están a la vista. */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Link
          href={`/compras/pagos/${payment.id}`}
          className={secondaryLinkClass}
        >
          <Icon name="printer" className="size-4" />
          Imprimir
          <span className="sr-only"> el comprobante del pago</span>
        </Link>
        {payment.voided ? null : (
          <Link
            href={`/compras/pagos/${payment.id}?confirmar=anular`}
            className={dangerOutlineLinkClass}
          >
            Anular pago
          </Link>
        )}
      </div>
    </aside>
  );
}

// Los tres bloques de la lámina, **solo cuando el pago tiene conversión** (V-8): uno en la misma
// moneda no tiene salida ni cotización que mostrar, y entonces va el monto solo, como en el recibo
// del cobro.
function PaymentAmounts({ payment }: { payment: SupplierPaymentDetail }) {
  const appliedLabel = payment.goodsReceipt
    ? "Aplicado a la recepción"
    : "Aplicado a la cuenta";
  if (!payment.tender) {
    return (
      <div className="mt-3 rounded-xl border border-border px-4 py-3">
        <p className="text-sm text-muted">{appliedLabel}:</p>
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(payment.amount, payment.currency)}
        </p>
      </div>
    );
  }
  const rate = formatExchangeRate(
    exchangeRateFromDatabase(payment.tender.exchangeRate),
  );
  return (
    <div className="mt-3 flex flex-col gap-2">
      <AmountRow
        icon="package"
        label={appliedLabel}
        detail={`Monto en ${payment.currency}`}
        value={formatMoney(payment.amount, payment.currency)}
      />
      <AmountRow
        icon="banknote"
        label="Salida registrada"
        detail={`Monto en ${payment.tender.currency}`}
        value={formatMoney(payment.tender.amount, payment.tender.currency)}
      />
      <AmountRow
        icon="trendingUp"
        label="Cotización guardada"
        detail={
          payment.tender.negotiated
            ? "acordada para este pago"
            : "copiada al registrar"
        }
        value={`1 ${payment.currency} = ${payment.tender.currency} ${rate}`}
      />
    </div>
  );
}

function AmountRow({
  icon,
  label,
  detail,
  value,
}: {
  // El juego de íconos del proyecto no tiene uno de doble flecha, que es el que dibuja la lámina
  // para la cotización: va `trendingUp`, que es el que ya usa el tipo de cambio.
  icon: "package" | "banknote" | "trendingUp";
  label: string;
  detail: string;
  value: string;
}) {
  return (
    <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-border px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <Icon name={icon} className="size-5 shrink-0 text-muted" />
        <span className="min-w-0">
          <span className="block font-semibold">{label}</span>
          <span className="block text-xs text-muted">{detail}</span>
        </span>
      </span>
      <span className="font-bold tabular-nums">{value}</span>
    </p>
  );
}
