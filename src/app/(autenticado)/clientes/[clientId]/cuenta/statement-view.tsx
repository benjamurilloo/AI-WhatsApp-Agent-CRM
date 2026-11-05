import Link from "next/link";
import { getClientStatement } from "@/modules/cash";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  linkClass,
  primaryLinkClass,
} from "@/app/_components/form-styles";
import { ActionNotice } from "@/app/_components/action-notice";
import { PageNotice } from "@/app/_components/page-notice";
import { formatFullDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { PrintButton } from "@/app/(autenticado)/cobros/[receiptId]/print-button";
import { NOT_AN_INVOICE_LEGEND } from "@/app/(autenticado)/devoluciones/messages";
import {
  CLIENT_NOT_FOUND_MESSAGE,
  FORBIDDEN_PAGE_MESSAGE,
  IMPUTATION_NOTE,
  STATEMENT_TITLE,
  UNNAMED_CLIENT_TEXT,
} from "./messages";
import { ACCOUNT_RECEIPT_NOTICE } from "../cobrar/messages";
import { StatementBody } from "../account-statement";
import {
  statementTabHref,
  STATEMENT_TAB_LABEL,
  STATEMENT_TABS,
  type StatementTab,
} from "./statement-tabs";

// Pantalla 37 (brief-21.6, D-4; ADR 0022, puntos 9 y 11): el estado de cuenta de un cliente,
// imprimible como los comprobantes. Por moneda, el resumen (debe, haber, saldo, a favor y las señas
// retenidas aparte) y la imputación de hoy de cada venta vigente: a dónde se aplicó cada peso.
// Debajo, los comprobantes del cliente, de la más nueva a la más vieja, sin saldo corrido. Para los
// dos roles, sin el contacto del cliente; un admin cobra a cuenta desde acá. Lo compone la página
// con cash: crm no depende de cash (ADR 0022, punto 13). Desde la 24.4.1, el cuerpo es
// StatementBody, el mismo de la pestaña Cuenta corriente de la ficha (brief-24.4.1, D-4).
//
// **Desde la 24.7.2 (D-3) esto es una vista con dos entradas, no una pantalla.** Se llega desde la
// ficha del cliente (`/clientes/[id]/cuenta`) y desde Finanzas (`/cuentas/[id]`), y las dos dibujan
// exactamente lo mismo: solo cambia a dónde vuelve. El README del lote V2-10 lo pide con todas las
// letras —«Ver cuenta» abre el mismo estado financiero desde la ficha, desde Finanzas y desde las
// ventas, y «no se crean cuentas duplicadas»— y la nota del Roadmap que ofrecía hacer esta subfase
// antes de la pestaña de la 24.4.1 **ya no se podía cumplir**: esa subfase cerró el 2026-10-29.
export async function ClientStatementView({
  clientId,
  receiptParam,
  back,
  cobrarHref,
  baseHref,
  tab,
}: {
  clientId: string;
  receiptParam: string;
  back: { href: string; label: string };
  // A dónde lleva «Cobrar a cuenta». Lo arma cada entrada, para que el volver del cobro traiga de
  // vuelta a la que se usó (brief-24.7.2, D-3).
  cobrarHref: string;
  // La ruta de esta entrada, para que los enlaces de las pestañas vuelvan a ella y no a la otra.
  baseHref: string;
  tab: StatementTab;
}) {
  const context = await requireSession();
  const found = await getClientStatement(context, clientId);
  if (!found.ok) {
    return (
      <PageNotice
        title={STATEMENT_TITLE}
        message={
          found.code === "FORBIDDEN"
            ? FORBIDDEN_PAGE_MESSAGE
            : CLIENT_NOT_FOUND_MESSAGE
        }
        back={back}
      />
    );
  }
  const { statement } = found;
  const [timeZone, frame] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
  ]);
  const name = statement.client.displayName ?? UNNAMED_CLIENT_TEXT;
  // Después de un cobro a cuenta (D-5): el aviso, con el enlace al recibo si es de este cliente.
  const newReceipt = statement.documents.find(
    (row) => row.kind === "receipt" && row.id === receiptParam,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href={back.href} label={back.label} />
        <DetailHeader
          title={`${STATEMENT_TITLE} de ${name}`}
          leading={<HeaderIcon name="list" />}
          subtitle={<p>{IMPUTATION_NOTE}</p>}
          actions={
            <>
              {context.role === "admin" ? (
                <Link href={cobrarHref} className={primaryLinkClass}>
                  Cobrar a cuenta
                </Link>
              ) : null}
              <PrintButton />
            </>
          }
        />
        <div role="status" className="mt-4 empty:hidden">
          {newReceipt ? (
            <ActionNotice>
              {ACCOUNT_RECEIPT_NOTICE}{" "}
              <Link
                href={`/cobros/${newReceipt.id}`}
                className={`${linkClass} font-mono`}
              >
                {newReceipt.displayNumber}
              </Link>
            </ActionNotice>
          ) : null}
        </div>
      </div>

      <article
        data-comprobante
        aria-labelledby="estado-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
          </div>
          <div className="text-right">
            <h2 id="estado-titulo" className="text-lg font-semibold">
              {STATEMENT_TITLE}
            </h2>
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-sm">
              Al {formatFullDateTime(statement.generatedAt, timeZone)}
            </p>
          </div>
        </header>

        {/* Las tarjetas por moneda de la lámina 02: lo que debe o tiene a favor en cada una, a la
            vista antes de cualquier detalle, más el equivalente orientativo. **No reemplazan al
            detalle**: el resumen por moneda sigue abajo, con su debe, su haber y sus señas. */}
        {statement.currencies.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {statement.currencies.map((account) => (
              <div
                key={account.currency}
                className="rounded-xl border border-border px-4 py-3"
              >
                <p className="text-sm text-muted">
                  {account.balance.side === "debt"
                    ? `Debe ${account.currency}`
                    : account.balance.side === "favor"
                      ? `A favor ${account.currency}`
                      : `Al día en ${account.currency}`}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatMoney(
                    account.balance.side === "zero"
                      ? "0.00"
                      : account.balance.amount,
                    account.currency,
                  )}
                </p>
              </div>
            ))}
            {statement.references.owed ? (
              <div className="rounded-xl border border-border px-4 py-3">
                <p className="text-sm text-muted">Equivalente orientativo</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatMoney(
                    statement.references.owed.total,
                    statement.references.owed.currency,
                  )}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Las deudas conservan su moneda.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Las dos pestañas de la lámina. Al imprimir se ven las dos: la pantalla 37 es un
            comprobante y sale entera, elija lo que elija quien la mira. */}
        <nav
          aria-label="Secciones del estado de cuenta"
          className="print:hidden"
        >
          <ul className="mt-6 flex gap-1 border-b border-border">
            {STATEMENT_TABS.map((item) => (
              <li key={item}>
                <Link
                  href={statementTabHref(baseHref, item)}
                  aria-current={item === tab ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                    item === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  {STATEMENT_TAB_LABEL[item]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={tab === "resumen" ? undefined : "hidden print:block"}>
          <StatementBody
            statement={statement}
            timeZone={timeZone}
            show="resumen"
          />
        </div>
        <div
          className={tab === "comprobantes" ? undefined : "hidden print:block"}
        >
          <StatementBody
            statement={statement}
            timeZone={timeZone}
            show="comprobantes"
          />
        </div>

        <p className="mt-6 text-xs text-muted">{IMPUTATION_NOTE}</p>
        <p className="mt-2 text-center text-sm font-semibold uppercase">
          {NOT_AN_INVOICE_LEGEND}
        </p>
      </article>

      <p className="mt-6 text-sm text-muted print:hidden">
        Fechas en {timeZone}.
      </p>
    </main>
  );
}
