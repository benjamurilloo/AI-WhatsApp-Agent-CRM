import Link from "next/link";
import type { OrderReceipts } from "@/modules/cash";
import type { OrderDetail } from "@/modules/orders";
import { PhoneText } from "@/app/(autenticado)/clientes/phone-text";
import { DetailList } from "@/app/_components/detail-list";
import {
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { StatTile } from "@/app/_components/stat-tile";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity, quantityFromDatabase } from "@/shared/quantity";
import {
  LineUnitList,
  lineUnitPriceText,
  UnitStockState,
} from "../line-unit-list";
import {
  AVAILABLE_NOTE,
  CURRENT_PRODUCT_NAME_NOTE,
  FIXED_PRICES_NOTE,
  nextStepHint,
  statusStripText,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_PRODUCT_TEXT,
} from "../messages";

// Las tres tarjetas de las láminas 03, 04 y 07. Viven acá y no en un archivo propio porque las
// usan Resumen y Señas, y la lista cerrada del brief nombra estos cuatro archivos de la ficha.
//
// **Los tres números salen de `cash`, no de `orders`** (brief-24.6.1, D-3): lo señado y lo que
// falta son dinero, y `orders` no depende de `cash`. La página los compone y se los pasa a la
// pestaña ya resueltos. Sin recibos —un pedido que `cash` no puede leer— se muestra solo el total
// del pedido, en vez de inventar un cero que parecería «nadie señó nada».
export function OrderStatTiles({
  order,
  receipts,
}: {
  order: OrderDetail;
  receipts: OrderReceipts | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile
        icon="receipt"
        value={formatMoney(order.total, order.currency)}
        label="Total del pedido"
      />
      {receipts ? (
        <>
          <StatTile
            icon="banknote"
            value={formatMoney(receipts.deposited, receipts.currency)}
            label="Señado"
          />
          <StatTile
            icon="clock"
            value={formatMoney(receipts.outstanding, receipts.currency)}
            label="Falta del total"
          />
        </>
      ) : null}
    </div>
  );
}

// La pestaña Resumen de la ficha (brief-24.6.1; láminas 03, 05 y 06 de la v2): las tres tarjetas,
// la franja que dice qué compromete el estado, la tabla de productos y, al costado, el siguiente
// paso y el origen.
//
// Las tres láminas dibujan tres juegos de columnas distintos. Acá va el de V-2, que es la unión
// sin repetidos: **Producto · Unidad / IMEI · Estado de stock · Cantidad · Precio unitario ·
// Subtotal**. «Disponible» se suma solo en un pendiente, que es lo que la 19.3 ya hacía y ninguna
// lámina contradice.
export function SummaryTab({
  order,
  receipts,
  sale,
  origin,
  timeZone,
}: {
  order: OrderDetail;
  receipts: OrderReceipts | null;
  // La venta del pedido, compuesta por la página con `sales`: `orders` no lee `sales`
  // (ADR 0021, punto 9). Null si el pedido no está entregado o todavía no la tiene.
  sale: { id: string; displayNumber: string } | null;
  origin: string;
  timeZone: string;
}) {
  const showAvailable = order.status === "pending";
  const client = order.client;
  const short = (line: OrderDetail["lines"][number]) =>
    line.available !== null &&
    quantityFromDatabase(line.available) < quantityFromDatabase(line.quantity);
  const strip = statusStripText(order.status);

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
      {/* `min-w-0` en los dos ítems de la grilla: sin él su ancho mínimo es el del contenido
          y la tabla de productos estira la columna en vez de desplazarse dentro de su
          `overflow-x-auto`. Medido: 361 px de desbordamiento a 320 px y 374 px a 390 px con
          equipos (brief-24.6.1, AC-13). */}
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
        <OrderStatTiles order={order} receipts={receipts} />

        <p
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${strip.className}`}
        >
          <Icon name={strip.icon} className="mt-0.5 size-5 shrink-0" />
          <span>
            <span className="font-semibold">{strip.title}</span> · {strip.text}
          </span>
        </p>

        <SectionCard
          id="lineas-titulo"
          title={`Productos (${order.lines.length})`}
          icon="list"
          action={
            <span className="text-sm text-muted">{FIXED_PRICES_NOTE}</span>
          }
        >
          <div
            className="-mx-5 overflow-x-auto sm:-mx-6"
            tabIndex={0}
            role="region"
            aria-label={`Productos del pedido ${order.displayNumber}`}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Productos del pedido {order.displayNumber}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Producto
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Unidad / IMEI
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado de stock
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Cantidad
                  </th>
                  {showAvailable ? (
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Disponible
                    </th>
                  ) : null}
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Precio unitario
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.position}>
                    <td className={tableCellClass}>
                      {line.product ? (
                        <>
                          <Link
                            href={`/productos/${line.productId}`}
                            className={linkClass}
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
                    <td className={tableCellClass}>
                      {line.units.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <LineUnitList
                          units={line.units}
                          currency={line.currency}
                          markUnavailable={order.status === "pending"}
                          showChips
                        />
                      )}
                    </td>
                    <td className={tableCellClass}>
                      {line.units.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <UnitStockState units={line.units} />
                      )}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatQuantity(line.quantity)}
                      {line.product ? (
                        <span className="text-muted"> {line.product.unit}</span>
                      ) : null}
                    </td>
                    {showAvailable ? (
                      <td
                        className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                      >
                        {line.available !== null
                          ? formatQuantity(line.available)
                          : "—"}
                        {short(line) ? (
                          <span className="block text-xs font-semibold text-danger">
                            No alcanza
                          </span>
                        ) : null}
                      </td>
                    ) : null}
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {lineUnitPriceText(line)}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(line.lineTotal, line.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    colSpan={showAvailable ? 6 : 5}
                    className={`${tableCellClass} text-right font-semibold`}
                  >
                    Total del pedido
                  </th>
                  <td
                    className={`${tableCellClass} text-right font-semibold whitespace-nowrap tabular-nums`}
                  >
                    {formatMoney(order.total, order.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted">{CURRENT_PRODUCT_NAME_NOTE}</p>
          {showAvailable ? (
            <p className="mt-2 text-sm text-muted">{AVAILABLE_NOTE}</p>
          ) : null}
        </SectionCard>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        {/* «Siguiente paso» de la lámina 03: qué va a pasar si se aprieta el botón principal, en
            palabras, antes de abrirlo. En un pedido cerrado no hay siguiente paso y la tarjeta no
            se dibuja, en vez de decir «nada». */}
        {nextStepHint(order.status) ? (
          <SectionCard id="siguiente-titulo" title="Siguiente paso" icon="info">
            <p className="text-sm">{nextStepHint(order.status)}</p>
          </SectionCard>
        ) : null}

        {/* La venta del entregado. El botón «Emitir venta» vive en el encabezado desde la
            24.6.1, pero **el estado de la venta tiene que seguir dicho en la ficha**: un
            `viewer` no ve ningún botón, y sin esta tarjeta no sabría si el pedido ya se
            facturó. Lo decía la 20.2 y se conserva. */}
        {order.status === "delivered" ? (
          <SectionCard id="venta-titulo" title="Venta" icon="receipt">
            {sale ? (
              <p>
                <Link href={`/ventas/${sale.id}`} className={linkClass}>
                  Venta {sale.displayNumber}
                </Link>
              </p>
            ) : (
              <p className="text-sm text-muted">
                Este pedido todavía no tiene su venta.
              </p>
            )}
          </SectionCard>
        ) : null}

        <SectionCard id="origen-titulo" title="Origen del pedido" icon="user">
          <DetailList
            items={[
              { label: "Origen", icon: "user", value: origin },
              {
                label: "Creado",
                icon: "calendar",
                value: formatShortDateTime(order.createdAt, timeZone),
              },
            ]}
          />
        </SectionCard>

        <SectionCard id="cliente-titulo" title="Cliente" icon="user">
          <DetailList
            items={[
              {
                label: "Nombre",
                icon: "user",
                value: client ? (
                  <Link href={`/clientes/${client.id}`} className={linkClass}>
                    {client.displayName}
                  </Link>
                ) : (
                  UNKNOWN_CLIENT_TEXT
                ),
              },
              ...(client
                ? [
                    {
                      label: "Teléfono",
                      icon: "phone" as const,
                      value: (
                        <PhoneText
                          phone={client.phone}
                          emptyText="Sin teléfono"
                        />
                      ),
                    },
                  ]
                : []),
              ...(client?.contact?.email
                ? [
                    {
                      label: "Email",
                      icon: "mail" as const,
                      value: client.contact.email,
                    },
                  ]
                : []),
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}
