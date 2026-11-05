import type { Metadata } from "next";
import Link from "next/link";
import { getAccountReceiptForm } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
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
import { formatDate } from "@/app/_format/date-time";
import { acceptedCurrencies, formatMoney } from "@/shared/money";
import { rateLabel } from "@/app/(autenticado)/caja/exchange";
import { NO_ACTIVE_METHODS_MESSAGE } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import {
  CLIENT_NOT_FOUND_MESSAGE,
  UNNAMED_CLIENT_TEXT,
} from "../cuenta/messages";
import { AccountReceiptForm } from "./account-receipt-form";
import {
  ACCOUNT_RECEIPT_ADMIN_ONLY_MESSAGE,
  ACCOUNT_RECEIPT_HELP,
  ACCOUNT_RECEIPT_TITLE,
} from "./messages";

export const metadata: Metadata = {
  title: "Cobrar a cuenta — AI WhatsApp Agent CRM",
};

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;

// Pantalla 38 (brief-21.6, D-5; ADR 0022, punto 9): el cobro a cuenta de un cliente, solo admin.
// Muestra lo que debe hoy por moneda, con sus ventas con saldo de la más vieja a la más nueva, y el
// formulario, con la vista previa de la regla antes de registrar. Lo compone la página con cash.
//
// *Desde la 24.7.2* (brief-24.7.2, lámina 03): las ventas con saldo y la ayuda son **contexto del
// paso 1** y viajan al formulario como `contexto`, que las dibuja solo mientras se cargan los
// datos. En la revisión la lámina muestra **solo** las dos columnas; dejarlas arriba agregaba
// ruido y repetía, con otras palabras, el aviso de que la imputación no se elige a mano.
export default async function AccountReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  const { clientId } = await params;
  const query = await searchParams;
  // El estado de cuenta tiene dos entradas desde la 24.7.2 (D-3), así que el volver sigue la que
  // se usó. **No se acepta una URL de vuelta por parámetro**, que sería una redirección abierta:
  // el parámetro solo dice *de dónde* se vino y la ruta la arma esta página.
  const back =
    query.desde === "finanzas"
      ? { href: `/cuentas/${clientId}`, label: "Volver al estado de cuenta" }
      : {
          href: `/clientes/${clientId}/cuenta`,
          label: "Volver al estado de cuenta",
        };
  if (context.role !== "admin") {
    return (
      <PageNotice
        title={ACCOUNT_RECEIPT_TITLE}
        message={ACCOUNT_RECEIPT_ADMIN_ONLY_MESSAGE}
        back={back}
      />
    );
  }
  const form = await getAccountReceiptForm(context, clientId);
  if (!form.ok) {
    return (
      <PageNotice
        title={ACCOUNT_RECEIPT_TITLE}
        message={
          form.code === "FORBIDDEN"
            ? ACCOUNT_RECEIPT_ADMIN_ONLY_MESSAGE
            : CLIENT_NOT_FOUND_MESSAGE
        }
        back={{ href: "/clientes", label: "Volver a clientes" }}
      />
    );
  }
  const timeZone = await getOrganizationTimezone(context);
  const name = form.client.displayName ?? UNNAMED_CLIENT_TEXT;
  const owing = form.currencies.filter((row) => row.owed !== "0.00");

  const contexto = (
    <>
      {owing.map((account) => (
        <div
          key={account.currency}
          className="overflow-x-auto rounded-xl border border-border"
          tabIndex={0}
          role="region"
          aria-label={`Ventas con saldo en ${account.currency}`}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="px-4 pt-3 text-left font-semibold">
              Ventas con saldo en{" "}
              <span className="font-mono">{account.currency}</span>, de la más
              vieja a la más nueva
            </caption>
            <thead>
              <tr>
                <th scope="col" className={tableHeadCellClass}>
                  Venta
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Fecha
                </th>
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
                  Falta
                </th>
              </tr>
            </thead>
            <tbody>
              {account.sales
                .filter((sale) => sale.outstanding !== "0.00")
                .map((sale) => (
                  <tr key={sale.id}>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      <Link
                        href={`/ventas/${sale.id}`}
                        className={`${linkClass} font-mono`}
                      >
                        {sale.displayNumber}
                      </Link>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatDate(sale.issuedAt, timeZone)}
                    </td>
                    <td className={numberCell}>
                      {formatMoney(sale.outstanding, account.currency)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-sm text-muted">{ACCOUNT_RECEIPT_HELP}</p>
    </>
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <BackLink href={back.href} label={back.label} />
      <div className="mt-4">
        <PageHeader
          title={`Cobrar a cuenta a ${name}`}
          subtitle={
            owing.length === 0
              ? "No debe nada: lo que se cobre queda a favor."
              : `Debe ${owing
                  .map((row) => formatMoney(row.owed, row.currency))
                  .join(" y ")}.`
          }
        />
      </div>

      <div className={`mt-6 ${cardClass} p-5 sm:p-6`}>
        {form.paymentMethods.length === 0 ? (
          <p>
            {NO_ACTIVE_METHODS_MESSAGE}{" "}
            <Link href="/caja/medios-de-pago" className={linkClass}>
              Ir a los medios de pago
            </Link>
          </p>
        ) : (
          <AccountReceiptForm
            clientId={form.client.id}
            clientName={name}
            fromFinance={query.desde === "finanzas"}
            // Lo que debe por moneda, que esta página ya leyó para su encabezado: la revisión lo
            // muestra como contexto y avisa qué queda pendiente en otra moneda. Sin lectura nueva.
            debts={form.currencies.map((row) => ({
              currency: row.currency,
              owed: row.owed,
            }))}
            contexto={contexto}
            cancelHref={back.href}
            defaults={{
              currency: form.proposed?.currency ?? "",
              paymentMethodId:
                form.paymentMethods.length === 1
                  ? form.paymentMethods[0]!.id
                  : "",
              amount: form.proposed?.amountInput ?? "",
              tenderedCurrency: "",
              exchangeRate: "",
              exchangeRateId: "",
            }}
            // Con moneda principal, solo la principal y las monedas con saldo del cliente (brief-29.4,
            // D-6).
            currencies={
              form.exchange
                ? form.exchange.appliedCurrencies
                : acceptedCurrencies()
            }
            paymentMethods={form.paymentMethods}
            hasOpenSession={form.openSession !== null}
            exchange={
              form.exchange
                ? {
                    mainCurrency: form.exchange.mainCurrency,
                    quoteCurrency: form.exchange.quoteCurrency,
                    rate: form.exchange.rate
                      ? rateLabel(
                          form.exchange.rate,
                          form.exchange.mainCurrency,
                          form.exchange.quoteCurrency,
                          timeZone,
                        )
                      : null,
                  }
                : null
            }
          />
        )}
      </div>
      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
