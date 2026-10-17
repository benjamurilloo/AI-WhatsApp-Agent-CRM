import type { Metadata } from "next";
import Link from "next/link";
import { getSupplierAccountPaymentForm } from "@/modules/cash";
import { getSupplier } from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import {
  cardClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { acceptedCurrencies, formatMoney } from "@/shared/money";
import {
  IN_FAVOR_NOTE,
  NO_ACTIVE_METHODS_MESSAGE,
  PAYMENT_ADMIN_ONLY_MESSAGE,
  PAYMENT_SUPPLIER_NOT_FOUND_MESSAGE,
} from "../../../pagos/messages";
import { SupplierPaymentForm } from "../../../pagos/payment-form";

export const metadata: Metadata = {
  title: "Pago a cuenta — AI WhatsApp Agent CRM",
};

const TITLE = "Pago a cuenta";

// Pantalla 51 (brief-22.6, D-13): el pago a cuenta de un proveedor, solo admin, también a uno
// desactivado (ADR 0023, punto 2). Por moneda, lo que se le debe y lo que está a favor, de la misma
// cuenta que usa el tope del pago (D-6). La moneda propuesta es la de su recepción con saldo más
// vieja, con lo que se debe en ella. Sin tope: lo que exceda queda a favor del negocio.
export default async function SupplierAccountPaymentPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const context = await requireSession();
  const { supplierId } = await params;
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
  const name = supplier.supplier.name;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Pago a cuenta de ${name}`}
          subtitle="No elige una recepción: se imputa de la más vieja a la más nueva."
        />
      </div>
      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {form.currencies.length === 0 ? (
          <p className="mb-4 text-sm text-muted">
            No se le debe nada y no hay nada a favor.
          </p>
        ) : (
          <div
            className="-mx-5 mb-4 overflow-x-auto sm:-mx-6"
            tabIndex={0}
            role="region"
            aria-label={`Cuenta de ${name} por moneda`}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Cuenta de {name} por moneda</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Moneda
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Se le debe
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    A favor del negocio
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Recepciones con saldo
                  </th>
                </tr>
              </thead>
              <tbody>
                {form.currencies.map((row) => (
                  <tr key={row.currency}>
                    <th scope="row" className={`${tableCellClass} font-mono`}>
                      {row.currency}
                    </th>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {formatMoney(row.owed, row.currency)}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {formatMoney(row.inFavor, row.currency)}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {row.receiptsWithBalance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              currencies: acceptedCurrencies(),
            }}
            cancelHref={back.href}
            defaultCurrency={form.proposed?.currency ?? ""}
            defaultAmount={form.proposed?.amountInput ?? ""}
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
          />
        )}
      </div>
    </main>
  );
}
