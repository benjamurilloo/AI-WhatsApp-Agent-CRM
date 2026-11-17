import type { Metadata } from "next";
import Link from "next/link";
import {
  getSupplierAccountPaymentForm,
  previewSupplierAccountPayment,
} from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { getSupplier } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import {
  cardClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { acceptedCurrencies, formatMoney } from "@/shared/money";
import {
  IN_FAVOR_NOTE,
  NO_ACTIVE_METHODS_MESSAGE,
  PAYMENT_ADMIN_ONLY_MESSAGE,
  PAYMENT_SUPPLIER_NOT_FOUND_MESSAGE,
  PREVIEW_IN_FAVOR_ROW,
  PREVIEW_NOTE,
} from "../../../pagos/messages";
import { SupplierPaymentForm } from "../../../pagos/payment-form";
import { receiptExchange } from "@/app/(autenticado)/caja/exchange";

export const metadata: Metadata = {
  title: "Pago a cuenta — AI WhatsApp Agent CRM",
};

const TITLE = "Pago a cuenta";

// Pantalla 51 (brief-22.6, D-13): el pago a cuenta de un proveedor, solo admin, también a uno
// desactivado (ADR 0023, punto 2). Por moneda, lo que se le debe y lo que está a favor, de la misma
// cuenta que usa el tope del pago (D-6). La moneda propuesta es la de su recepción con saldo más
// vieja, con lo que se debe en ella. Sin tope: lo que exceda queda a favor del negocio. Desde la
// 29.4.3, con moneda principal, las monedas aplicables son la principal y las que tienen saldo, y se
// paga también en la otra moneda, aplicada en la principal (brief-29.4.3, D-4 y D-7). Desde la
// 24.8.2 tiene la forma de la lámina 12: la situación por moneda en tarjetas, el formulario en dos
// columnas y la **vista previa de la aplicación** del pago propuesto (D-4), que corre la misma regla
// que el confirmar. **Ninguna regla del pago cambia.**
export default async function SupplierAccountPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ moneda?: string | string[] }>;
}) {
  const context = await requireSession();
  const { supplierId } = await params;
  const { moneda } = await searchParams;
  const back = {
    href: `/compras/proveedores/${supplierId}`,
    label: "Volver al proveedor",
  };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={TITLE}
        message={PAYMENT_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const supplier = await getSupplier(context, supplierId);
  if (!supplier.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={
          supplier.code === "FORBIDDEN"
            ? PAYMENT_ADMIN_ONLY_MESSAGE
            : PAYMENT_SUPPLIER_NOT_FOUND_MESSAGE
        }
        back={{ href: "/compras/proveedores", label: "Volver a proveedores" }}
      />
    );
  }
  const found = await getSupplierAccountPaymentForm(
    context,
    supplier.supplier.id,
  );
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={PAYMENT_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const { form } = found;
  // Lo que se le debe en la principal, para la equivalencia en la otra moneda.
  const owedMain = form.mainCurrency
    ? form.currencies.find((row) => row.currency === form.mainCurrency)
    : undefined;
  const exchange = form.mainCurrency
    ? receiptExchange({
        offer: form.exchange,
        targetCurrency: form.mainCurrency,
        outstanding: owedMain?.owed ?? "0.00",
        outstandingInput:
          owedMain &&
          owedMain.owed !== "0.00" &&
          form.proposed?.currency === form.mainCurrency
            ? form.proposed.amountInput
            : "",
        chosen: typeof moneda === "string" ? moneda.toUpperCase() : undefined,
        basePath: `/compras/proveedores/${supplier.supplier.id}/pagar`,
        timezone: await getOrganizationTimezone(context),
        movement: "payment",
        outstandingLabel: "Se le deben",
      })
    : null;
  const name = supplier.supplier.name;
  // D-4: la vista previa es la de **lo propuesto**, que es lo que el formulario trae escrito. Sin
  // moneda propuesta no se le debe nada, y entonces no hay nada que previsualizar.
  const previewResult = form.proposed
    ? await previewSupplierAccountPayment(context, supplier.supplier.id, {
        currency: form.proposed.currency,
        amount: form.proposed.amount,
      })
    : null;
  const preview =
    previewResult && previewResult.ok ? previewResult.preview : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Pago a cuenta · ${name}`}
          subtitle="No elige una recepción: se imputa de la más vieja a la más nueva."
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {/* «Situación actual del proveedor» (lámina 12): una tarjeta por moneda con lo que se le
            debe, con lo que está a favor cuando lo hay y con cuántos comprobantes tienen saldo. Es
            el mismo resumen por moneda que traía la tabla, con la forma de la lámina. */}
        <h2 className="text-base font-semibold">
          Situación actual del proveedor
        </h2>
        {form.currencies.length === 0 ? (
          <p className="mt-3 mb-4 text-sm text-muted">
            No se le debe nada y no hay nada a favor.
          </p>
        ) : (
          <ul className="mt-3 mb-4 grid gap-3 sm:grid-cols-2">
            {form.currencies.map((row) => (
              <li
                key={row.currency}
                className="min-w-0 rounded-xl border border-border px-4 py-3"
              >
                <p className="text-sm text-muted">
                  Saldo pendiente en{" "}
                  <span className="font-mono">{row.currency}</span>
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {formatMoney(row.owed, row.currency)}
                </p>
                {row.inFavor === "0.00" ? null : (
                  <p className="mt-1 text-sm text-muted">
                    A favor del negocio:{" "}
                    <span className="tabular-nums">
                      {formatMoney(row.inFavor, row.currency)}
                    </span>
                  </p>
                )}
                <p className="mt-1 text-sm text-muted">
                  {row.receiptsWithBalance === 1
                    ? "1 comprobante con saldo"
                    : `${row.receiptsWithBalance} comprobantes con saldo`}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mb-4 text-sm text-muted">{IN_FAVOR_NOTE}</p>
        {/* Desde la 22.7 (brief-22.7, D-5): el estado de cuenta, con la imputación de hoy. */}
        <p className="mb-4 text-sm">
          <Link
            href={`/compras/proveedores/${supplier.supplier.id}/cuenta`}
            className={linkClass}
          >
            Estado de cuenta
          </Link>
        </p>
        {form.paymentMethods.length === 0 ? (
          <p>
            {NO_ACTIVE_METHODS_MESSAGE}{" "}
            <Link href="/caja/medios-de-pago" className={linkClass}>
              Ir a los medios de pago
            </Link>
          </p>
        ) : (
          <SupplierPaymentForm
            target={{
              kind: "account",
              supplierId: supplier.supplier.id,
              currencies: form.appliedCurrencies ?? acceptedCurrencies(),
            }}
            cancelHref={back.href}
            defaultCurrency={form.proposed?.currency ?? form.mainCurrency ?? ""}
            defaultAmount={form.proposed?.amountInput ?? ""}
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
            exchange={exchange}
            preview={
              preview === null ? null : (
                <section aria-labelledby="pago-vista-previa">
                  <h2
                    id="pago-vista-previa"
                    className="text-base font-semibold"
                  >
                    Vista previa de aplicación del pago
                  </h2>
                  <p className="mt-2 flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
                    <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                    <span>{PREVIEW_NOTE}</span>
                  </p>
                  <div
                    className="mt-3 overflow-x-auto"
                    tabIndex={0}
                    role="region"
                    aria-label="Aplicación del pago propuesto"
                  >
                    <table className="w-full border-collapse text-left text-sm">
                      <caption className="sr-only">
                        A qué comprobantes se aplicaría el pago propuesto
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className={tableHeadCellClass}>
                            Concepto
                          </th>
                          <th scope="col" className={tableHeadCellClass}>
                            Comprobante
                          </th>
                          <th
                            scope="col"
                            className={`${tableHeadCellClass} text-right`}
                          >
                            Saldo pendiente
                          </th>
                          <th
                            scope="col"
                            className={`${tableHeadCellClass} text-right`}
                          >
                            Aplicación de este pago
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={row.id}>
                            <td className={tableCellClass}>
                              {row.kind === "charge"
                                ? "Trabajo del técnico"
                                : "Recepción de compra"}
                            </td>
                            <td className={`${tableCellClass} font-mono`}>
                              {row.displayNumber}
                            </td>
                            <td
                              className={`${tableCellClass} text-right tabular-nums`}
                            >
                              {formatMoney(row.outstanding, preview.currency)}
                            </td>
                            <td
                              className={`${tableCellClass} text-right font-semibold tabular-nums`}
                            >
                              {formatMoney(row.applied, preview.currency)}
                            </td>
                          </tr>
                        ))}
                        {preview.inFavor === "0.00" ? null : (
                          <tr>
                            <td className={tableCellClass}>
                              {PREVIEW_IN_FAVOR_ROW}
                              <span className="block text-xs text-muted">
                                Se aplicará a los comprobantes que vengan en{" "}
                                {preview.currency}
                              </span>
                            </td>
                            <td className={tableCellClass}>—</td>
                            <td
                              className={`${tableCellClass} text-right tabular-nums`}
                            >
                              —
                            </td>
                            <td
                              className={`${tableCellClass} text-right font-semibold tabular-nums`}
                            >
                              {formatMoney(preview.inFavor, preview.currency)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {preview.others.length === 0 ? null : (
                    <p className="mt-3 text-sm text-muted">
                      Sigue pendiente:{" "}
                      {preview.others
                        .map((row) => formatMoney(row.owed, row.currency))
                        .join(" · ")}
                      . Una moneda nunca cancela otra.
                    </p>
                  )}
                </section>
              )
            }
          />
        )}
      </div>
    </main>
  );
}
