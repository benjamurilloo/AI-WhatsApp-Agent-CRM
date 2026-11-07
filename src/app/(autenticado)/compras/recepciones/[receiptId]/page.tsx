import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import { getGoodsReceiptPayments } from "@/modules/cash";
import { getAvailableStock } from "@/modules/inventory";
import { getAppFrame, getOrganizationTimezone } from "@/modules/organizations";
import {
  formatCuit,
  getGoodsReceipt,
  listGoodsReceiptAudit,
  type GoodsReceiptLineUnit,
} from "@/modules/purchasing";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "@/app/(autenticado)/_audit/actor";
import {
  UNIT_STATUS_ICON,
  UNIT_STATUS_LABEL,
  UNIT_STATUS_TONE,
} from "@/app/(autenticado)/productos/[productId]/unidades/messages";
import { ActionNotice } from "@/app/_components/action-notice";
import { AuditCard } from "@/app/_components/audit-card";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  cardClass,
  dangerOutlineLinkClass,
  linkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  formatFullDateTime,
  formatShortDateTime,
} from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import { PrintButton } from "../../ordenes/[orderId]/print-button";
import { ReceiptPaymentsSection } from "../../pagos/receipt-payments-section";
import {
  byQuantity,
  FORBIDDEN_PAGE_MESSAGE,
  NOT_AN_INVOICE_LEGEND,
  UNKNOWN_PRODUCT_TEXT,
  UNKNOWN_SUPPLIER_TEXT,
} from "../../ordenes/messages";
import type { SearchParams } from "../filters";
import {
  CURRENT_BADGE_TEXT,
  CURRENT_DATA_NOTE,
  GOODS_RECEIPT_NOT_FOUND_MESSAGE,
  goodsReceiptNoticeMessage,
  VOID_REASON_LABEL,
  VOIDED_BADGE_TEXT,
} from "../messages";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";
import { VoidGoodsReceiptConfirm } from "./void-confirm";

export const metadata: Metadata = {
  title: "Recepción — AI WhatsApp Agent CRM",
};

const TITLE = "Recepción";

function page(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

// El grado y la batería de una unidad, cuando los tiene. No cuesta una lectura: vienen en la misma
// sentencia que el estado (brief-24.8.1-b, H-3). Un producto sin capacidad de unidades serializadas
// no tiene unidades, así que no hace falta preguntar por la capacidad para no dibujarlos.
function unitDetail(unit: GoodsReceiptLineUnit): string | null {
  const parts = [
    unit.gradeName,
    unit.batteryHealth === null ? null : `Batería ${unit.batteryHealth} %`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// El detalle de una recepción, que es también su página imprimible (brief-22.4, D-11; ADR 0023,
// punto 13), con el molde del detalle de la orden de compra: la organización, el número, la fecha,
// el proveedor con sus datos de hoy, la orden, la referencia del proveedor, las líneas, el total y
// la leyenda. Al imprimir queda solo el comprobante. La historia, al pie. Solo admin. Desde la 22.5
// (brief-22.5, D-9): una anulada lo dice, enlaza su anulación y se imprime con la marca; una vigente se
// anula en el paso ?confirmar=anular, que muestra lo que sale del stock con lo disponible hoy. Desde la
// 22.6 (brief-22.6, D-13), lo pagado y lo que falta, compuesto con cash.
//
// Desde la 24.8.1-b tiene la forma de la lámina 04 del lote V2-11: la cabecera con la insignia de
// vigencia y el subtítulo «Proveedor · Orden» (V-25), el resumen de la derecha con **las unidades
// recibidas** (V-27) y «Productos recibidos» por línea, con las unidades como filas hijas
// identificadas por su IMEI y con su estado de hoy (D-2 y D-3). **Las pestañas de la lámina no se
// adoptan** (D-1): esta ficha es la página imprimible y se imprime entera.
export default async function GoodsReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const { receiptId } = await params;
  const query = await searchParams;
  const found = await getGoodsReceipt(context, receiptId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
    }
    return (
      <PageNotice
        title={TITLE}
        message={GOODS_RECEIPT_NOT_FOUND_MESSAGE}
        back={{ href: "/compras/recepciones", label: "Volver a recepciones" }}
      />
    );
  }
  const receipt = found.receipt;
  const href = `/compras/recepciones/${receipt.id}`;
  const [timeZone, frame, audit, payments] = await Promise.all([
    getOrganizationTimezone(context),
    getAppFrame(context),
    listGoodsReceiptAudit(context, receipt.id, page(query.historial)),
    getGoodsReceiptPayments(context, receipt.id),
  ]);
  const actorLabel = audit.ok
    ? await auditActorLabels(context.organizationId, audit.entries)
    : null;
  const notice = goodsReceiptNoticeMessage(query.aviso);
  const supplier = receipt.supplier;
  const receiptVoid = receipt.receiptVoid;
  const voiding = receiptVoid === null && query.confirmar === "anular";
  // Lo disponible hoy de cada producto, solo para la confirmación.
  const available = voiding
    ? await getAvailableStock(
        context,
        receipt.lines.map((line) => line.productId),
      )
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
      <div className="print:hidden">
        <BackLink href="/compras/recepciones" label="Volver a recepciones" />
        <DetailHeader
          title={`Recepción ${receipt.displayNumber}`}
          leading={<HeaderIcon name="package" />}
          badges={
            receiptVoid ? (
              <StatusBadge
                tone="neutral"
                icon="circleX"
                title={`Anulada por ${receiptVoid.displayNumber}`}
              >
                {VOIDED_BADGE_TEXT}
              </StatusBadge>
            ) : (
              <StatusBadge tone="success" icon="circleCheck">
                {CURRENT_BADGE_TEXT}
              </StatusBadge>
            )
          }
          // El subtítulo de la lámina: el proveedor y, si la tiene, la orden (V-25). El total se
          // fue al resumen de la derecha, que es donde lo pone la lámina.
          subtitle={
            <p>
              {supplier ? supplier.name : UNKNOWN_SUPPLIER_TEXT}
              {receipt.purchaseOrder ? (
                <>
                  {" · "}
                  <span className="font-mono">
                    {receipt.purchaseOrder.displayNumber}
                  </span>
                </>
              ) : null}
            </p>
          }
          // El menú «⋮» de la lámina no se implementa: necesita JavaScript, por decisión
          // registrada y repetida desde la 24.7.2-b (V-31).
          actions={<PrintButton />}
        />

        <div role="status" className="mt-4 empty:hidden">
          {notice ? <ActionNotice>{notice}</ActionNotice> : null}
        </div>
        {receiptVoid ? (
          <p className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
            Anulada por{" "}
            <Link
              href={`${href}/anulacion`}
              className={`${linkClass} font-mono`}
            >
              {receiptVoid.displayNumber}
            </Link>{" "}
            el {formatShortDateTime(receiptVoid.createdAt, timeZone)}:{" "}
            {VOID_REASON_LABEL[receiptVoid.reason]}.
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] print:mt-0 print:block">
        <div className="flex min-w-0 flex-col gap-6">
          <article
            data-comprobante
            aria-labelledby="recepcion-titulo"
            className={`${cardClass} min-w-0 p-5 sm:p-6 print:border-0 print:p-0 print:shadow-none`}
          >
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-lg font-semibold">
                  {frame.organizationName}
                </p>
                <p className="text-sm text-muted">{NOT_AN_INVOICE_LEGEND}</p>
              </div>
              <div className="text-right">
                <h2 id="recepcion-titulo" className="text-lg font-semibold">
                  Recepción{" "}
                  <span className="font-mono">{receipt.displayNumber}</span>
                </h2>
                {receiptVoid ? (
                  <p className="font-semibold uppercase">
                    {VOIDED_BADGE_TEXT} por{" "}
                    <span className="font-mono">
                      {receiptVoid.displayNumber}
                    </span>
                  </p>
                ) : null}
                <p className="text-sm">
                  {formatFullDateTime(receipt.createdAt, timeZone)}
                </p>
              </div>
            </header>

            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Proveedor</dt>
                <dd className="font-semibold">
                  {supplier ? (
                    <Link
                      href={`/compras/proveedores/${supplier.id}`}
                      className={`${linkClass} print:no-underline`}
                    >
                      {supplier.name}
                    </Link>
                  ) : (
                    UNKNOWN_SUPPLIER_TEXT
                  )}
                </dd>
              </div>
              {supplier?.cuit ? (
                <div>
                  <dt className="text-muted">CUIT</dt>
                  <dd>{formatCuit(supplier.cuit)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted">Orden de compra</dt>
                <dd className="font-mono">
                  {receipt.purchaseOrder ? (
                    <Link
                      href={`/compras/ordenes/${receipt.purchaseOrder.id}`}
                      className={`${linkClass} print:no-underline`}
                    >
                      {receipt.purchaseOrder.displayNumber}
                    </Link>
                  ) : (
                    <span className="font-sans">Sin orden</span>
                  )}
                </dd>
              </div>
              {receipt.supplierReference ? (
                <div>
                  <dt className="text-muted">Remito o factura del proveedor</dt>
                  <dd>{receipt.supplierReference}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted">Moneda</dt>
                <dd>{receipt.currency}</dd>
              </div>
            </dl>

            {/* «Productos recibidos (N)» de la lámina 04. **N son las líneas**, no las unidades:
                con D-2 cada línea es una fila y las unidades cuelgan de ella, y una recepción
                mixta —veinte fundas y dos equipos— tiene dos líneas. Las unidades recibidas, que
                es el otro recuento, están en el resumen de la derecha (H-2). */}
            <h3 className={`mt-6 ${sectionTitleClass}`}>
              Productos recibidos ({receipt.lines.length})
            </h3>
            <div
              className="-mx-5 mt-4 overflow-x-auto sm:-mx-6 print:mx-0 print:overflow-visible"
              tabIndex={0}
              role="region"
              aria-label={`Productos recibidos en la recepción ${receipt.displayNumber}`}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Productos recibidos en la recepción {receipt.displayNumber},
                  con las unidades de cada línea
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Producto
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Cantidad
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Costo unitario
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.lines.map((line) => (
                    <Fragment key={line.position}>
                      <tr>
                        <td className={tableCellClass}>
                          {line.product ? (
                            <>
                              <Link
                                href={`/productos/${line.productId}`}
                                className={`${linkClass} print:no-underline`}
                              >
                                {line.product.name}
                              </Link>
                              <span className="block font-mono text-xs text-muted">
                                {line.product.sku}
                              </span>
                            </>
                          ) : (
                            UNKNOWN_PRODUCT_TEXT
                          )}
                        </td>
                        <td
                          className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                        >
                          {formatQuantity(line.quantity)}
                          {line.product ? (
                            <span className="text-muted">
                              {" "}
                              {line.product.unit}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                        >
                          {formatMoney(line.unitCost, receipt.currency)}
                        </td>
                        <td
                          className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                        >
                          {formatMoney(line.lineTotal, receipt.currency)}
                        </td>
                      </tr>
                      {/* Una fila por unidad, debajo de su línea (D-2). La identifica **su IMEI**
                          completo, que es lo que el README del lote exige poder consultar, y no un
                          «U-000501» que no existe en el sistema (D-3). El estado es el de hoy y
                          llega en la misma sentencia que los IMEI (H-3). */}
                      {line.units.map((unit) => (
                        <tr key={unit.unitId}>
                          <td className={`${tableCellClass} pl-8`}>
                            <span className="font-mono break-all">
                              {unit.serial}
                            </span>
                            {unitDetail(unit) ? (
                              <span className="block text-xs text-muted">
                                {unitDetail(unit)}
                              </span>
                            ) : null}
                          </td>
                          <td className={tableCellClass} colSpan={3}>
                            <StatusBadge
                              tone={UNIT_STATUS_TONE[unit.status]}
                              icon={UNIT_STATUS_ICON[unit.status]}
                            >
                              {UNIT_STATUS_LABEL[unit.status]}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th
                      scope="row"
                      colSpan={3}
                      className={`${tableCellClass} text-right font-semibold`}
                    >
                      Total
                    </th>
                    <td
                      className={`${tableCellClass} text-right font-semibold whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(receipt.total, receipt.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="mt-6 text-center text-sm font-semibold uppercase">
              {NOT_AN_INVOICE_LEGEND}
            </p>
            <p className="mt-4 text-sm text-muted print:hidden">
              {CURRENT_DATA_NOTE}
            </p>
          </article>

          {payments.ok ? (
            <div className="print:hidden">
              <ReceiptPaymentsSection
                receiptId={receipt.id}
                supplierId={supplier?.id ?? null}
                standing={payments.standing}
                timeZone={timeZone}
              />
            </div>
          ) : null}

          <div className="print:hidden">
            <SectionCard id="anulacion-titulo" title="Anulación" icon="close">
              {receiptVoid ? (
                <>
                  <p className="text-sm">
                    Anulación{" "}
                    <span className="font-mono">
                      {receiptVoid.displayNumber}
                    </span>{" "}
                    · {VOID_REASON_LABEL[receiptVoid.reason]}
                  </p>
                  <p className="mt-4 text-sm">
                    <Link href={`${href}/anulacion`} className={linkClass}>
                      Ver el comprobante de la anulación
                    </Link>
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Esta recepción está vigente.
                </p>
              )}
              {receiptVoid === null ? (
                <div className="mt-4">
                  {voiding ? (
                    <VoidGoodsReceiptConfirm
                      receiptId={receipt.id}
                      displayNumber={receipt.displayNumber}
                      hasOrder={receipt.purchaseOrder !== null}
                      total={receipt.total}
                      currency={receipt.currency}
                      paidNote={
                        payments.ok && payments.standing.paid !== "0.00"
                          ? `Lo pagado contra esta recepción, ${formatMoney(payments.standing.paid, receipt.currency)}, pasa a la cuenta del proveedor: se imputa a sus otras recepciones o queda a favor del negocio.`
                          : null
                      }
                      lines={receipt.lines.map((line) => ({
                        productId: line.productId,
                        name: line.product?.name ?? UNKNOWN_PRODUCT_TEXT,
                        unit: line.product?.unit ?? "",
                        quantity: line.quantity,
                        units: line.units,
                        available:
                          (available?.ok
                            ? available.available.get(line.productId)
                            : undefined) ?? "0.000",
                      }))}
                    />
                  ) : (
                    <Link
                      href={`${href}?confirmar=anular`}
                      className={dangerOutlineLinkClass}
                    >
                      <Icon name="close" className="size-4" />
                      Anular la recepción
                    </Link>
                  )}
                </div>
              ) : null}
            </SectionCard>
          </div>

          {audit.ok ? (
            <div className="print:hidden">
              <AuditCard
                caption={`Historia de la recepción ${receipt.displayNumber}`}
                rows={audit.entries.map((entry) => ({
                  id: entry.id,
                  when: formatShortDateTime(entry.createdAt, timeZone),
                  actor: actorLabel?.(entry.actor),
                  action: auditActionLabel(entry),
                  change: describeAuditDiff(entry),
                }))}
                page={audit.page}
                pageCount={audit.pageCount}
                pageSize={AUDIT_PAGE_SIZE}
                total={audit.total}
                hrefFor={(target) =>
                  target > 1 ? `${href}?historial=${target}` : href
                }
              />
            </div>
          ) : null}

          <p className="text-sm text-muted print:hidden">
            Fechas en {timeZone}.
          </p>
        </div>

        {/* El resumen de la derecha de la lámina (V-27). Lo pagado y lo que falta **los compone la
            página** con `cash`, como hoy: `purchasing` no depende de `cash` (ADR 0023, punto 11). */}
        <aside
          aria-labelledby="resumen-titulo"
          className={`${cardClass} min-w-0 p-5 sm:p-6 print:hidden`}
        >
          <h2 id="resumen-titulo" className={sectionTitleClass}>
            Resumen de la recepción
          </h2>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex min-w-0 items-center gap-2 text-muted">
                <Icon name="receipt" className="size-4 shrink-0" />
                Total recepción
              </dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(receipt.total, receipt.currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex min-w-0 items-center gap-2 text-muted">
                <Icon name="package" className="size-4 shrink-0" />
                Unidades recibidas
              </dt>
              <dd className="font-semibold tabular-nums">
                {formatQuantity(receipt.unitCount)}{" "}
                <span className="font-normal text-muted">
                  {byQuantity(receipt.unitCount, "unidad", "unidades")}
                </span>
              </dd>
            </div>
            {payments.ok ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex min-w-0 items-center gap-2 text-muted">
                    <Icon name="banknote" className="size-4 shrink-0" />
                    Pagado
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatMoney(
                      payments.standing.paid,
                      payments.standing.currency,
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex min-w-0 items-center gap-2 text-muted">
                    <Icon name="clock" className="size-4 shrink-0" />
                    {/* Una recepción anulada no debe nada: lo pagado contra ella pasó a la cuenta
                        del proveedor (brief-22.6, D-6), y decir «Restante en deuda» sería falso. */}
                    {payments.standing.voided
                      ? "Pasó a la cuenta"
                      : "Restante en deuda"}
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatMoney(
                      payments.standing.voided
                        ? payments.standing.toAccount
                        : payments.standing.outstanding,
                      payments.standing.currency,
                    )}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </aside>
      </div>
    </main>
  );
}
