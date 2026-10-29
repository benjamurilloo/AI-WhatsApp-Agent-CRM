import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Estado de cuenta — AI WhatsApp Agent CRM",
};

// Pantalla 37 (brief-21.6, D-4; ADR 0022, puntos 9 y 11): el estado de cuenta de un cliente,
// imprimible como los comprobantes. Por moneda, el resumen (debe, haber, saldo, a favor y las señas
// retenidas aparte) y la imputación de hoy de cada venta vigente: a dónde se aplicó cada peso. Debajo,
// los comprobantes del cliente, de la más nueva a la más vieja, sin saldo corrido. Para los dos roles,
// sin el contacto del cliente; un admin cobra a cuenta desde acá. Lo compone la página con cash: crm
// no depende de cash (ADR 0022, punto 13). Desde la 24.4.1, el cuerpo es StatementBody, el mismo de la
// pestaña Cuenta corriente de la ficha (brief-24.4.1, D-4).
export default async function ClientStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireSession();
  const { clientId } = await params;
  const query = await searchParams;
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
        back={{ href: "/clientes", label: "Volver a clientes" }}
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
  const receiptParam = typeof query.cobro === "string" ? query.cobro : "";
  const newReceipt = statement.documents.find(
    (row) => row.kind === "receipt" && row.id === receiptParam,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href={`/clientes/${clientId}`} label="Volver al cliente" />
        <DetailHeader
          title={`${STATEMENT_TITLE} de ${name}`}
          leading={<HeaderIcon name="list" />}
          subtitle={<p>{IMPUTATION_NOTE}</p>}
          actions={
            <>
              {context.role === "admin" ? (
                <Link
                  href={`/clientes/${clientId}/cobrar`}
                  className={primaryLinkClass}
                >
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

        <StatementBody statement={statement} timeZone={timeZone} />

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
