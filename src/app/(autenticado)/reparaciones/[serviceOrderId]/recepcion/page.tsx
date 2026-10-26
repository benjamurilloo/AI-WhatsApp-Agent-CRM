import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import { getServiceOrder, repairsAllowed } from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import { BackLink } from "@/app/_components/detail-header";
import { cardClass } from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { formatFullDateTime } from "@/app/_format/date-time";
import { PrintButton } from "../../../compras/ordenes/[orderId]/print-button";
import {
  ERASED_TEXT,
  RECEPTION_LEGEND,
  SERVICE_ORDER_NOT_FOUND_MESSAGE,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_MODEL_TEXT,
} from "../../messages";

export const metadata: Metadata = {
  title: "Comprobante de recepción — AI WhatsApp Agent CRM",
};

const TITLE = "Comprobante de recepción";

// El comprobante de recepción del equipo, imprimible, para el cliente (brief-29.6, D-10): el número, el
// cliente, el modelo, el IMEI, lo que reporta y la fecha. Sin el técnico ni el costo. Al imprimir queda
// solo el comprobante, como el de la orden de compra. Los dos roles. Una orden de una unidad propia no
// tiene recepción (brief-29.6.2, D-7): 404.
export default async function ReceptionReceiptPage({
  params,
}: {
  params: Promise<{ serviceOrderId: string }>;
}) {
  const context = await requireSession();
  if (!(await repairsAllowed(context))) notFound();
  const { serviceOrderId } = await params;
  const found = await getServiceOrder(context, serviceOrderId);
  if (!found.ok) {
    return (
      <PageNotice
        title={TITLE}
        message={SERVICE_ORDER_NOT_FOUND_MESSAGE}
        back={{ href: "/reparaciones", label: "Volver a las órdenes" }}
      />
    );
  }
  const order = found.order;
  // Un reclamo de garantía no tiene comprobante imprimible (brief-29.9.2, alcance excluido).
  if (order.kind !== "customer_device") notFound();
  const [timeZone, frame] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink
          href={`/reparaciones/${order.id}`}
          label={`Volver a la orden ${order.displayNumber}`}
        />
        <PrintButton />
      </div>

      <article
        data-comprobante
        aria-labelledby="recepcion-titulo"
        className={`mt-6 ${cardClass} p-5 sm:p-6 print:mt-0 print:border-0 print:p-0 print:shadow-none`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{frame.organizationName}</p>
            <p className="text-sm text-muted">{RECEPTION_LEGEND}</p>
          </div>
          <div className="text-right">
            <h1 id="recepcion-titulo" className="text-lg font-semibold">
              Recepción de equipo{" "}
              <span className="font-mono">{order.displayNumber}</span>
            </h1>
            <p className="text-sm">
              {formatFullDateTime(order.createdAt, timeZone)}
            </p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Cliente</dt>
            <dd className="font-semibold">
              {order.client?.displayName ?? UNKNOWN_CLIENT_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Equipo</dt>
            <dd className="font-semibold">
              {order.model?.name ?? UNKNOWN_MODEL_TEXT}
            </dd>
          </div>
          <div>
            <dt className="text-muted">IMEI o número de serie</dt>
            <dd className="font-mono">{order.deviceSerial ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Lo que reporta el cliente</dt>
            <dd className="whitespace-pre-line">
              {order.reportedIssue ?? ERASED_TEXT}
            </dd>
          </div>
        </dl>

        <p className="mt-8 text-sm">
          Conservá este comprobante: se presenta al retirar el equipo.
        </p>
        <p className="mt-6 text-center text-sm font-semibold uppercase">
          {RECEPTION_LEGEND}
        </p>
      </article>
    </main>
  );
}
