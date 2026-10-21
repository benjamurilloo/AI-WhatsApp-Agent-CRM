import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProductStock,
  listProductUnits,
  listStockMovements,
  listUnitGrades,
  type ProductUnit,
} from "@/modules/inventory";
import { getUnitOrders } from "@/modules/orders";
import {
  getMainCurrency,
  getOrganizationTimezone,
  hasCapability,
} from "@/modules/organizations";
import { listTechnicians } from "@/modules/purchasing";
import { getUnitSales } from "@/modules/sales";
import { listUnitServiceOrders, repairsAllowed } from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  dangerOutlineLinkClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { acceptedCurrencies, formatMoney } from "@/shared/money";
import type { SearchParams } from "../../filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  PRODUCT_NOT_FOUND_MESSAGE,
} from "../../messages";
import { ProductSubNav } from "../product-sub-nav";
import {
  CorrectUnitForm,
  RegisterUnitForm,
  ReleaseUnitForm,
  SendToRepairForm,
  TrackingForm,
  WriteOffForm,
} from "./forms";
import {
  availableText,
  batteryText,
  NO_AVAILABLE_UNITS_MESSAGE,
  noticeMessage,
  TRACKING_LABEL,
  TRACKING_LOCKED_MESSAGE,
  UNIT_ORIGIN_LABEL,
  UNIT_STATUS_LABEL,
  UNITS_TITLE,
} from "./messages";

export const metadata: Metadata = {
  title: "Unidades — AI WhatsApp Agent CRM",
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Las monedas del costo, con la principal primero.
function currencyOptions(
  main: string | null,
): { code: string; label: string }[] {
  const codes = acceptedCurrencies();
  const ordered = main
    ? [main, ...codes.filter((code) => code !== main)]
    : codes;
  return ordered.map((code) => ({ code, label: code }));
}

// Las unidades de un producto (ADR 0024, punto 6; brief-29.5, D-3, D-4 y D-6), de la capacidad
// serialized_units: cómo se lleva su stock y, en un producto por unidad, sus unidades disponibles y
// las dadas de baja. Un admin cambia el seguimiento mientras no haya movimientos, carga, corrige y da
// de baja unidades; un viewer ve la lista sin el costo (FR-PROD-21). ?baja=<id> y ?corregir=<id>
// abren el formulario de una unidad. Sin la capacidad, 404. Desde la 29.5.2 (brief-29.5.2, D-2 y D-5),
// el precio propio de cada unidad, para los dos roles, y las reservadas y vendidas, con su pedido o su
// venta. Desde la 29.6.2 (brief-29.6.2, D-7), con repairs, un admin manda a reparar una unidad
// disponible o en revisión (?reparar=<id>), y libera, corrige o da de baja una en revisión; las que
// están en reparación o en revisión se listan aparte, con su orden.
export default async function ProductUnitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  if (!(await hasCapability(context.organizationId, "serialized_units"))) {
    notFound();
  }
  const { productId } = await params;
  const query = await searchParams;

  const found = await getProductStock(context, productId);
  if (!found.ok) {
    if (found.code === "FORBIDDEN") {
      return (
        <PageNotice title={UNITS_TITLE} message={FORBIDDEN_PAGE_MESSAGE} />
      );
    }
    return (
      <PageNotice
        title={UNITS_TITLE}
        message={PRODUCT_NOT_FOUND_MESSAGE}
        back={{ href: "/productos", label: "Volver a productos" }}
      />
    );
  }
  const product = found.product;
  const isAdmin = context.role === "admin";
  const units = await listProductUnits(context, product.id);
  const list: ProductUnit[] = units.ok ? units.units : [];
  const available = list.filter((unit) => unit.status === "available");
  const writtenOff = list.filter((unit) => unit.status === "written_off");
  const committed = list.filter(
    (unit) => unit.status === "reserved" || unit.status === "sold",
  );
  const committedIds = committed.map((unit) => unit.id);
  const inShop = list.filter(
    (unit) => unit.status === "in_repair" || unit.status === "in_review",
  );
  const [unitOrders, unitSales, repairs, repairOrders] = await Promise.all([
    getUnitOrders(context, committedIds),
    getUnitSales(context, committedIds),
    repairsAllowed(context),
    listUnitServiceOrders(
      context,
      list.map((unit) => unit.id),
    ),
  ]);
  // Las que ya salieron del local y pasaron por el técnico (brief-29.6.2, D-7).
  const repairedBefore = list.filter(
    (unit) =>
      unit.status !== "in_repair" &&
      unit.status !== "in_review" &&
      repairOrders.has(unit.id),
  );
  const history = await listStockMovements(context, product.id, {
    type: "all",
    from: "",
    to: "",
    page: 1,
  });
  const hasMovements = history.ok && history.total > 0;
  const grades = isAdmin ? await listUnitGrades(context) : null;
  const activeGrades = grades?.ok
    ? grades.grades
        .filter((grade) => grade.isActive)
        .map((grade) => ({ id: grade.id, name: grade.name }))
    : [];
  const timeZone = await getOrganizationTimezone(context);
  const mainCurrency = isAdmin
    ? await getMainCurrency(context.organizationId)
    : null;
  const notice = noticeMessage(query.aviso);
  // Una unidad disponible o, desde la 29.6.2, en revisión (brief-29.6.2, U-2 y U-3).
  const workable = list.filter(
    (unit) => unit.status === "available" || unit.status === "in_review",
  );
  const writingOff = isAdmin
    ? workable.find((unit) => unit.id === single(query.baja))
    : undefined;
  const correcting = isAdmin
    ? workable.find((unit) => unit.id === single(query.corregir))
    : undefined;
  const repairing =
    isAdmin && repairs
      ? workable.find((unit) => unit.id === single(query.reparar))
      : undefined;
  const technicians = repairing ? await listTechnicians(context) : null;
  const base = `/productos/${product.id}/unidades`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <BackLink href="/productos" label="Volver a productos" />
      <DetailHeader
        title={product.name}
        leading={<HeaderIcon name="package" />}
        subtitle={<span className="font-mono text-sm">{product.sku}</span>}
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <ProductSubNav productId={product.id} current="unidades" />

      <SectionCard
        id="seguimiento-titulo"
        title="Cómo se lleva el stock"
        icon="layers"
        className="mt-6"
      >
        <p className="font-semibold">{TRACKING_LABEL[product.tracking]}</p>
        {isAdmin && !hasMovements ? (
          <div className="mt-4">
            <TrackingForm productId={product.id} current={product.tracking} />
          </div>
        ) : isAdmin ? (
          <p className="mt-2 text-sm text-muted">{TRACKING_LOCKED_MESSAGE}</p>
        ) : null}
      </SectionCard>

      {product.tracking === "unit" ? (
        <>
          {writingOff ? (
            <SectionCard
              id="baja-titulo"
              title="Dar de baja una unidad"
              icon="power"
              className="mt-6"
            >
              <WriteOffForm
                productId={product.id}
                unitId={writingOff.id}
                serial={writingOff.serial}
                inReview={writingOff.status === "in_review"}
              />
            </SectionCard>
          ) : null}
          {repairing ? (
            <SectionCard
              id="reparar-titulo"
              title="Mandar a reparar"
              icon="wrench"
              className="mt-6"
            >
              {technicians?.ok && technicians.technicians.length > 0 ? (
                <SendToRepairForm
                  productId={product.id}
                  unitId={repairing.id}
                  serial={repairing.serial}
                  technicians={technicians.technicians.map((technician) => ({
                    id: technician.id,
                    name: technician.name,
                  }))}
                />
              ) : (
                <p>
                  No hay técnicos activos. Marcá un proveedor como técnico desde
                  su ficha para mandarle unidades.
                </p>
              )}
            </SectionCard>
          ) : null}
          {correcting ? (
            <SectionCard
              id="corregir-titulo"
              title="Corregir una unidad"
              icon="pencil"
              className="mt-6"
            >
              <CorrectUnitForm
                productId={product.id}
                unitId={correcting.id}
                serial={correcting.serial}
                grades={activeGrades}
                gradeId={correcting.grade?.id ?? ""}
                batteryHealth={
                  correcting.batteryHealth === null
                    ? ""
                    : String(correcting.batteryHealth)
                }
                currencies={currencyOptions(mainCurrency)}
                price={correcting.price?.amount ?? ""}
                priceCurrency={correcting.price?.currency ?? ""}
              />
            </SectionCard>
          ) : null}

          <SectionCard
            id="disponibles-titulo"
            title="Unidades disponibles"
            icon="package"
            className="mt-6"
          >
            <p className="text-sm text-muted">
              {availableText(product.quantityAvailable)}.
            </p>
            {available.length === 0 ? (
              <p className="mt-3">{NO_AVAILABLE_UNITS_MESSAGE}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Unidades disponibles de {product.name}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className={tableHeadCellClass}>
                        IMEI o serie
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Grado
                      </th>
                      <th
                        scope="col"
                        className={`${tableHeadCellClass} text-right`}
                      >
                        Batería
                      </th>
                      <th
                        scope="col"
                        className={`${tableHeadCellClass} text-right`}
                      >
                        Precio
                      </th>
                      {isAdmin ? (
                        <th
                          scope="col"
                          className={`${tableHeadCellClass} text-right`}
                        >
                          Costo
                        </th>
                      ) : null}
                      <th scope="col" className={tableHeadCellClass}>
                        Origen
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Alta
                      </th>
                      {isAdmin ? (
                        <th scope="col" className={tableHeadCellClass}>
                          <span className="sr-only">Acciones</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {available.map((unit) => (
                      <tr key={unit.id}>
                        <td className={`${tableCellClass} font-mono`}>
                          {unit.serial}
                        </td>
                        <td className={tableCellClass}>
                          {unit.grade?.name ?? ""}
                        </td>
                        <td
                          className={`${tableCellClass} text-right tabular-nums`}
                        >
                          {batteryText(unit.batteryHealth)}
                        </td>
                        <td
                          className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                        >
                          {unit.price
                            ? formatMoney(
                                unit.price.amount,
                                unit.price.currency,
                              )
                            : "Del producto"}
                        </td>
                        {isAdmin ? (
                          <td
                            className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                          >
                            {unit.cost
                              ? formatMoney(
                                  unit.cost.amount,
                                  unit.cost.currency,
                                )
                              : ""}
                          </td>
                        ) : null}
                        <td className={tableCellClass}>
                          {UNIT_ORIGIN_LABEL[unit.origin]}
                        </td>
                        <td
                          className={`${tableCellClass} whitespace-nowrap tabular-nums`}
                        >
                          {formatShortDateTime(unit.createdAt, timeZone)}
                        </td>
                        {isAdmin ? (
                          <td className={tableCellClass}>
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={`${base}?corregir=${unit.id}#corregir-titulo`}
                                className={secondaryLinkClass}
                              >
                                Corregir
                                <span className="sr-only"> {unit.serial}</span>
                              </Link>
                              {repairs ? (
                                <Link
                                  href={`${base}?reparar=${unit.id}#reparar-titulo`}
                                  className={secondaryLinkClass}
                                >
                                  Mandar a reparar
                                  <span className="sr-only">
                                    {" "}
                                    {unit.serial}
                                  </span>
                                </Link>
                              ) : null}
                              <Link
                                href={`${base}?baja=${unit.id}#baja-titulo`}
                                className={dangerOutlineLinkClass}
                              >
                                Dar de baja
                                <span className="sr-only"> {unit.serial}</span>
                              </Link>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {isAdmin && product.isActive ? (
            <SectionCard
              id="cargar-titulo"
              title="Cargar unidad"
              icon="plus"
              className="mt-6"
            >
              <p className="mb-4 text-sm text-muted">
                Para una unidad que no vino de una recepción de mercadería. Lo
                que llega de un proveedor se carga con la recepción, que pide un
                IMEI por unidad.
              </p>
              <RegisterUnitForm
                productId={product.id}
                grades={activeGrades}
                currencies={currencyOptions(mainCurrency)}
                defaultCurrency={mainCurrency ?? "USD"}
              />
              {grades?.ok ? (
                <p className="mt-4 text-sm">
                  <Link href="/grados" className={secondaryLinkClass}>
                    Editar los grados
                  </Link>
                </p>
              ) : null}
            </SectionCard>
          ) : null}

          {inShop.length > 0 ? (
            <SectionCard
              id="reparacion-titulo"
              title="En reparación y en revisión"
              icon="wrench"
              className="mt-6"
            >
              <p className="text-sm text-muted">
                Están en el local, fuera del stock: no se venden ni se reservan.
                Una unidad vuelve de reparación en revisión, y se vende cuando
                se libera.
              </p>
              <ul className="mt-3 flex flex-col gap-3 text-sm">
                {inShop.map((unit) => {
                  const orders = repairOrders.get(unit.id) ?? [];
                  return (
                    <li
                      key={unit.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2"
                    >
                      <span className="font-mono">{unit.serial}</span>
                      <span>· {UNIT_STATUS_LABEL[unit.status]}</span>
                      {isAdmin && unit.cost ? (
                        <span className="tabular-nums text-muted">
                          · Costo{" "}
                          {formatMoney(unit.cost.amount, unit.cost.currency)}
                        </span>
                      ) : null}
                      {orders.map((order) => (
                        <Link
                          key={order.id}
                          href={`/reparaciones/${order.id}`}
                          className={secondaryLinkClass}
                        >
                          Orden {order.displayNumber}
                        </Link>
                      ))}
                      {isAdmin && unit.status === "in_review" ? (
                        <>
                          <ReleaseUnitForm
                            unitId={unit.id}
                            serial={unit.serial}
                          />
                          <Link
                            href={`${base}?corregir=${unit.id}#corregir-titulo`}
                            className={secondaryLinkClass}
                          >
                            Corregir
                            <span className="sr-only"> {unit.serial}</span>
                          </Link>
                          {repairs ? (
                            <Link
                              href={`${base}?reparar=${unit.id}#reparar-titulo`}
                              className={secondaryLinkClass}
                            >
                              Mandar a reparar
                              <span className="sr-only"> {unit.serial}</span>
                            </Link>
                          ) : null}
                          <Link
                            href={`${base}?baja=${unit.id}#baja-titulo`}
                            className={dangerOutlineLinkClass}
                          >
                            Dar de baja
                            <span className="sr-only"> {unit.serial}</span>
                          </Link>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          ) : null}

          {repairedBefore.length > 0 ? (
            <SectionCard
              id="reparaciones-anteriores-titulo"
              title="Reparaciones anteriores"
              icon="wrench"
              className="mt-6"
            >
              <ul className="flex flex-col gap-2 text-sm">
                {repairedBefore.map((unit) => (
                  <li
                    key={unit.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2"
                  >
                    <span className="font-mono">{unit.serial}</span>
                    <span>· {UNIT_STATUS_LABEL[unit.status]}</span>
                    {(repairOrders.get(unit.id) ?? []).map((order) => (
                      <Link
                        key={order.id}
                        href={`/reparaciones/${order.id}`}
                        className={secondaryLinkClass}
                      >
                        Orden {order.displayNumber}
                      </Link>
                    ))}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {committed.length > 0 ? (
            <SectionCard
              id="comprometidas-titulo"
              title="Reservadas y vendidas"
              icon="list"
              className="mt-6"
            >
              <ul className="flex flex-col gap-2 text-sm">
                {committed.map((unit) => {
                  const order = unitOrders.ok
                    ? unitOrders.orders.get(unit.id)
                    : undefined;
                  const sale = unitSales.ok
                    ? unitSales.sales.get(unit.id)
                    : undefined;
                  return (
                    <li key={unit.id} className="flex flex-wrap gap-x-2">
                      <span className="font-mono">{unit.serial}</span>
                      <span>· {UNIT_STATUS_LABEL[unit.status]}</span>
                      {order ? (
                        <Link
                          href={`/pedidos/${order.id}`}
                          className={secondaryLinkClass}
                        >
                          Pedido {order.displayNumber}
                        </Link>
                      ) : null}
                      {sale ? (
                        <Link
                          href={`/ventas/${sale.id}`}
                          className={secondaryLinkClass}
                        >
                          Venta {sale.displayNumber}
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-sm text-muted">
                Una unidad reservada o vendida no se corrige ni se da de baja.
              </p>
            </SectionCard>
          ) : null}

          {writtenOff.length > 0 ? (
            <SectionCard
              id="bajas-titulo"
              title="Dadas de baja"
              icon="power"
              className="mt-6"
            >
              <ul className="flex flex-col gap-2 text-sm">
                {writtenOff.map((unit) => (
                  <li key={unit.id}>
                    <span className="font-mono">{unit.serial}</span>
                    <span className="text-muted">
                      {" "}
                      · {formatShortDateTime(unit.updatedAt, timeZone)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted">
                El motivo de la baja de una unidad disponible está en los
                movimientos de stock. Una en revisión ya estaba fuera del stock:
                su baja no es un movimiento.
              </p>
            </SectionCard>
          ) : null}
        </>
      ) : null}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
