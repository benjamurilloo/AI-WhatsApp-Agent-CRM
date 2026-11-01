import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  countUnitsByStatus,
  getProductStock,
  getUnit,
  getUnitWarranties,
  getUnitWarrantySettings,
  listProductUnits,
  listStockMovements,
  listUnitAudit,
  listUnitGrades,
  listUnitMovements,
  UNIT_SEARCH_MIN_LENGTH,
  UNITS_PAGE_SIZE,
  type ProductUnit,
} from "@/modules/inventory";
import { appointmentsAllowed } from "@/modules/appointments";
import { getUnitOrders } from "@/modules/orders";
import {
  getMainCurrency,
  getOrganizationTimezone,
  hasCapability,
} from "@/modules/organizations";
import { listTechnicians } from "@/modules/purchasing";
import { getUnitSales } from "@/modules/sales";
import { listUnitServiceOrders, repairsAllowed } from "@/modules/service";
import { getUnitTradeIns } from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { auditActorLabels } from "../../../_audit/actor";
import { ActionNotice } from "@/app/_components/action-notice";
import {
  BackLink,
  DetailHeader,
  HeaderIcon,
} from "@/app/_components/detail-header";
import {
  dangerOutlineLinkClass,
  inputClass,
  labelClass,
  linkClass,
  secondaryButtonClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon, type IconName } from "@/app/_components/icons";
import {
  moreActionDangerClass,
  moreActionItemClass,
} from "@/app/_components/more-action-styles";
import { MoreActions } from "@/app/_components/more-actions";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import { logEvent, newRequestId } from "@/shared/log";
import { acceptedCurrencies, formatMoney } from "@/shared/money";
import {
  warrantyDaysText,
  warrantyText,
} from "../../../_warranty/warranty-text";
import type { SearchParams } from "../../filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  PRODUCT_NOT_FOUND_MESSAGE,
} from "../../messages";
import { ProductSubNav } from "../product-sub-nav";
import { readUnitCounts } from "../unit-counts";
import { readUnitList } from "./list-data";
import {
  listHref,
  panelHref,
  readUnitFilters,
  STATUS_ORDER,
  STATUS_VALUE,
} from "./filters";
import {
  CorrectUnitForm,
  RegisterUnitForm,
  ReleaseUnitForm,
  SendToRepairForm,
  TrackingForm,
  WarrantyDaysForm,
  WriteOffForm,
} from "./forms";
import {
  ALL_UNITS_LABEL,
  batteryText,
  NO_UNITS_FOR_FILTER_MESSAGE,
  NO_UNITS_MESSAGE,
  UNIT_COUNTS_UNAVAILABLE_MESSAGE,
  UNIT_PANEL_NOT_FOUND_MESSAGE,
  UNITS_UNAVAILABLE_MESSAGE,
  noticeMessage,
  SEARCH_LABEL,
  searchTooShortMessage,
  TRACKING_LABEL,
  TRACKING_LOCKED_MESSAGE,
  UNIT_ORIGIN_LABEL,
  UNIT_STATUS_ICON,
  UNIT_STATUS_LABEL,
  UNIT_STATUS_TONE,
  UNITS_TITLE,
  availableText,
} from "./messages";
import { readUnitHistory } from "./unit-history";
import { UnitPanel } from "./unit-panel";

export const metadata: Metadata = {
  title: "Unidades — AI WhatsApp Agent CRM",
};

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
// serialized_units. Un admin cambia el seguimiento mientras no haya movimientos, carga, corrige y da
// de baja unidades; un viewer ve la lista sin el costo (FR-PROD-21). Sin la capacidad, 404.
//
// Desde la 24.5.2 (brief-24.5.2, D-2, D-5, D-6, D-7 y D-8) la pantalla tiene la forma de la lámina
// 10: **una sola lista**, filtrable por estado (`?estado=`), buscable por sufijo de IMEI (`?imei=`)
// y paginada, con el panel de la unidad en `?unidad=<id>` y sus dos pestañas en `?vista=`.
//
// Reemplaza las cinco secciones fijas que la pantalla tenía hasta la 29.9 —disponibles, en
// reparación y en revisión, reparaciones anteriores, reservadas y vendidas, y dadas de baja—, que
// filtraban **en memoria** sobre todas las unidades del producto. No era una elección de forma: con
// la lectura paginada de D-8 esas secciones mostrarían un recorte de una página y mentirían. Lo que
// cada una aportaba vive ahora en la columna Estado, que lleva el pedido, la venta o la orden de
// reparación de la unidad, y en el panel.
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
  const filters = readUnitFilters(query);

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
  const base = `/productos/${product.id}/unidades`;

  // Las dos lecturas de la lista pasan por la capa de composición, con su `catch`: un error de base
  // **lanza**, así que sin esto la rama que anuncia «No disponible» era código muerto (I-2; el
  // bloqueante B-2 de la revisión independiente). `readUnitCounts` es el mismo de la 24.5.1.
  const reportar = (error: unknown) =>
    logEvent({
      level: "error",
      requestId: newRequestId(),
      route: "/productos/[productId]/unidades",
      code: "INTERNAL",
      userId: context.userId,
      organizationId: context.organizationId,
      error,
    });
  const [units, counts] = await Promise.all([
    readUnitList(
      () =>
        listProductUnits(context, product.id, {
          status: filters.status,
          serial: filters.serial,
          page: filters.page,
        }),
      reportar,
    ),
    readUnitCounts(() => countUnitsByStatus(context, product.id), reportar),
  ]);
  const list: ProductUnit[] = units?.units ?? [];
  const ids = list.map((unit) => unit.id);
  const committedIds = list
    .filter((unit) => unit.status === "reserved" || unit.status === "sold")
    .map((unit) => unit.id);

  const [unitOrders, unitSales, repairs, repairOrders, tradeIns, warranties] =
    await Promise.all([
      getUnitOrders(context, committedIds),
      getUnitSales(context, committedIds),
      repairsAllowed(context),
      listUnitServiceOrders(context, ids),
      getUnitTradeIns(
        context,
        list
          .filter((unit) => unit.origin === "trade_in")
          .map((unit) => unit.id),
      ),
      getUnitWarranties(
        context,
        list.filter((unit) => unit.status === "sold").map((unit) => unit.id),
      ),
    ]);

  const warrantyOf = (unitId: string) =>
    warranties.ok
      ? (warranties.units.find((unit) => unit.id === unitId)?.warranty ?? null)
      : null;
  // El origen de una unidad; la de un usado, con su comprobante.
  const origin = (unit: ProductUnit) => {
    const tradeIn = tradeIns.get(unit.id);
    return tradeIn ? (
      <Link href={`/usados/${tradeIn.id}`} className={secondaryLinkClass}>
        {UNIT_ORIGIN_LABEL.trade_in} {tradeIn.displayNumber}
      </Link>
    ) : (
      UNIT_ORIGIN_LABEL[unit.origin]
    );
  };

  const history = await listStockMovements(context, product.id, {
    type: "all",
    from: "",
    to: "",
    page: 1,
  });
  const hasMovements = history.ok && history.total > 0;
  // Un turno para ver una unidad disponible, con la capacidad appointments (brief-29.10, D-5).
  const appointments = isAdmin && (await appointmentsAllowed(context));
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

  // Los formularios ya no buscan su unidad **en la lista**: con la lista paginada, una unidad que
  // está en la página 2 no aparecería y el formulario no se abriría. `getUnit` la resuelve por id y
  // filtra por organización, así que además deja de depender de qué página se está mirando.
  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const openUnit = async (id: string | undefined) => {
    if (!id) return undefined;
    const result = await getUnit(context, id);
    return result.ok ? result.unit : undefined;
  };
  const workable = <T extends { status: ProductUnit["status"] }>(
    unit: T | undefined,
  ) =>
    unit && (unit.status === "available" || unit.status === "in_review")
      ? unit
      : undefined;

  const writingOff = isAdmin
    ? workable(await openUnit(single(query.baja)))
    : undefined;
  const correcting = isAdmin
    ? workable(await openUnit(single(query.corregir)))
    : undefined;
  const repairing =
    isAdmin && repairs
      ? workable(await openUnit(single(query.reparar)))
      : undefined;
  const technicians = repairing ? await listTechnicians(context) : null;
  // Los días de garantía, en cualquier estado salvo dada de baja (brief-29.9, D-1).
  const warrantyCandidate = isAdmin
    ? await openUnit(single(query.garantia))
    : undefined;
  const warrantyEditing =
    warrantyCandidate && warrantyCandidate.status !== "written_off"
      ? warrantyCandidate
      : undefined;
  const organizationWarranty = warrantyEditing
    ? await getUnitWarrantySettings(context)
    : null;

  // El panel de la unidad (D-2). Su historial sale de dos fuentes y **la auditoría solo la lee un
  // admin** (D-10): a un viewer no se la pedimos, y el servicio igual la rechazaría (I-9).
  //
  // Dos recortes sobre lo que `getUnit` devuelve, y los dos son del panel, no del servicio:
  //
  // 1. La unidad tiene que ser **de este producto**. `getUnit` resuelve por id dentro de la
  //    organización, así que un `?unidad=` de otro producto abriría un panel con una unidad que no
  //    está en la lista que se está mirando, con la ficha y los contadores de otro producto
  //    alrededor. Es incoherente, y no hace falta leer la base para verlo.
  // 2. Si no resuelve —id inválido, unidad de otra organización, de otro producto, o borrada—, la
  //    pantalla **lo dice** en lugar de dibujar la lista como si no se hubiera pedido nada. Era el
  //    hallazgo N-10: el enlace viejo o retocado a mano no daba error ni aviso, simplemente no
  //    pasaba nada, y el usuario no tenía forma de saber si el panel estaba vacío o roto.
  const panelCandidate = filters.unitId
    ? await openUnit(filters.unitId)
    : undefined;
  const panelUnit =
    panelCandidate && panelCandidate.productId === product.id
      ? panelCandidate
      : undefined;
  const panelMissing = Boolean(filters.unitId) && !panelUnit;
  const panelHistory = panelUnit
    ? await readUnitHistory({
        readMovements: () => listUnitMovements(context, panelUnit.id),
        readAudit: isAdmin
          ? () => listUnitAudit(context, panelUnit.id, 1)
          : null,
        onError: (error) =>
          logEvent({
            level: "error",
            requestId: newRequestId(),
            route: "/productos/[productId]/unidades",
            code: "INTERNAL",
            userId: context.userId,
            organizationId: context.organizationId,
            error,
          }),
      })
    : null;
  // La etiqueta del autor de una entrada de auditoría, con el emisor de una credencial de servicio
  // resuelto desde `ingestion`. La compone la página porque ningún módulo de dominio puede leer
  // `ingestion` sin un ciclo, y es la misma que usan las demás vistas de auditoría del proyecto:
  // tener una tercera forma de nombrar lo mismo era el hallazgo N-8.
  const actorLabel = await auditActorLabels(
    context.organizationId,
    panelHistory?.audit ?? [],
  );

  // Las acciones de una unidad, **declaradas una sola vez** y presentadas de dos formas: en la
  // fila van dentro de «···» y en el panel van a la vista, donde hay ancho de sobra.
  //
  // Hasta el 2026-11-01 estaban a la vista **también en la fila**: hasta cinco cajas con borde por
  // unidad, que es lo que empujaba la tabla más allá del ancho de la ventana. Lo pidió el recorrido
  // del usuario, y D-8 de la 24.1 ya decía dónde van: las acciones menos frecuentes y las
  // destructivas, fuera de la fila principal. La tabla de clientes hace lo mismo desde la 24.4.2.
  //
  // El sufijo `sr-only` con el serial se conserva: con veinticinco filas, «Corregir» a secas es
  // ambiguo para quien navega por nombres accesibles. Adentro del menú ya no puede desbordar la
  // tabla, y además el contenedor es bloque contenedor desde H-15.
  type UnitAction = {
    key: string;
    label: string;
    href: string;
    icon: IconName;
    suffix: string;
    danger?: boolean;
  };

  const unitActions = (unit: ProductUnit): UnitAction[] => {
    if (!isAdmin) return [];
    const canWork = unit.status === "available" || unit.status === "in_review";
    const actions: UnitAction[] = [];
    if (canWork) {
      actions.push({
        key: "corregir",
        label: "Corregir",
        href: `${base}?corregir=${unit.id}#corregir-titulo`,
        icon: "pencil",
        suffix: ` ${unit.serial}`,
      });
      if (repairs) {
        actions.push({
          key: "reparar",
          label: "Mandar a reparar",
          href: `${base}?reparar=${unit.id}#reparar-titulo`,
          icon: "wrench",
          suffix: ` ${unit.serial}`,
        });
      }
    }
    if (unit.status === "available" && appointments) {
      actions.push({
        key: "turno",
        label: "Dar un turno",
        href: `/turnos/nuevo?unidad=${unit.id}`,
        icon: "calendar",
        suffix: ` para ${unit.serial}`,
      });
    }
    if (unit.status !== "written_off") {
      actions.push({
        key: "garantia",
        label: "Días de garantía",
        href: `${base}?garantia=${unit.id}#garantia-titulo`,
        icon: "shield",
        suffix: ` ${unit.serial}`,
      });
    }
    if (canWork) {
      actions.push({
        key: "baja",
        label: "Dar de baja",
        href: `${base}?baja=${unit.id}#baja-titulo`,
        icon: "circleX",
        suffix: ` ${unit.serial}`,
        danger: true,
      });
    }
    return actions;
  };

  // En el panel: a la vista, con la forma de siempre.
  const actionsFor = (unit: ProductUnit) => (
    <>
      {unitActions(unit).map((action) => (
        <Link
          key={action.key}
          href={action.href}
          className={
            action.danger ? dangerOutlineLinkClass : secondaryLinkClass
          }
        >
          {action.label}
          <span className="sr-only">{action.suffix}</span>
        </Link>
      ))}
      {isAdmin && unit.status === "in_review" ? (
        <ReleaseUnitForm unitId={unit.id} serial={unit.serial} />
      ) : null}
    </>
  );

  // En la fila: dentro de «···». El menú se dibuja **siempre**, porque su primer ítem es «Ver
  // unidad» y eso lo necesita también un `viewer`, que no tiene ninguna de las demás acciones.
  //
  // `floating` no es decorativo: lo agregó la 24.4.2 porque dentro de una tabla que se desplaza el
  // menú se recortaba y le sumaba una barra. Sin JavaScript la lista queda a la vista, así que la
  // pantalla sigue funcionando sin scripts.
  const rowActions = (unit: ProductUnit) => (
    <MoreActions
      id={`unidad-${unit.id}`}
      label={`Más acciones de la unidad ${unit.serial}`}
      iconOnly
      floating
    >
      <li>
        <Link
          href={panelHref(base, filters, unit.id)}
          className={moreActionItemClass}
        >
          <Icon name="smartphone" className="size-4" />
          Ver unidad
        </Link>
      </li>
      {isAdmin && unit.status === "in_review" ? (
        <li>
          {/* La única acción que es un formulario. Desde el 2026-11-01 `ReleaseUnitForm` acepta la
              clase del ítem y su ícono, con la lista cerrada ampliada a `forms.tsx`. */}
          <ReleaseUnitForm
            unitId={unit.id}
            serial={unit.serial}
            className={moreActionItemClass}
            icon={<Icon name="circleCheck" className="size-4" />}
          />
        </li>
      ) : null}
      {unitActions(unit).map((action) => (
        <li key={action.key}>
          <Link
            href={action.href}
            className={`${moreActionItemClass} ${action.danger ? moreActionDangerClass : ""}`}
          >
            <Icon name={action.icon} className="size-4" />
            {action.label}
            <span className="sr-only">{action.suffix}</span>
          </Link>
        </li>
      ))}
    </MoreActions>
  );

  // El estado de una unidad con lo que la ata a otra cosa: su pedido, su venta, sus órdenes de
  // reparación y su garantía. Es lo que antes vivía en las secciones «Reservadas y vendidas»,
  // «En reparación y en revisión» y «Reparaciones anteriores».
  const statusCell = (unit: ProductUnit) => {
    const order = unitOrders.ok ? unitOrders.orders.get(unit.id) : undefined;
    const sale = unitSales.ok ? unitSales.sales.get(unit.id) : undefined;
    const warranty = warrantyOf(unit.id);
    const days = warranty ? warrantyDaysText(warranty) : null;
    const orders = repairOrders.get(unit.id) ?? [];
    return (
      <div className="flex flex-col gap-1">
        <StatusBadge
          tone={UNIT_STATUS_TONE[unit.status]}
          icon={UNIT_STATUS_ICON[unit.status]}
        >
          {UNIT_STATUS_LABEL[unit.status]}
        </StatusBadge>
        {order ? (
          <Link href={`/pedidos/${order.id}`} className={secondaryLinkClass}>
            Pedido {order.displayNumber}
          </Link>
        ) : null}
        {sale ? (
          <Link href={`/ventas/${sale.id}`} className={secondaryLinkClass}>
            Venta {sale.displayNumber}
          </Link>
        ) : null}
        {orders.map((serviceOrder) => (
          <Link
            key={serviceOrder.id}
            href={`/reparaciones/${serviceOrder.id}`}
            className={secondaryLinkClass}
          >
            {serviceOrder.kind === "warranty_claim" ? "Reclamo" : "Orden"}{" "}
            {serviceOrder.displayNumber}
          </Link>
        ))}
        {warranty ? (
          <span className="text-sm text-muted">
            {warrantyText(warranty)}
            {days ? ` (${days})` : ""}
          </span>
        ) : null}
      </div>
    );
  };

  const pageHref = (target: number) =>
    listHref(base, filters, { page: target });

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
          {warrantyEditing ? (
            <SectionCard
              id="garantia-titulo"
              title="Días de garantía"
              icon="pencil"
              className="mt-6"
            >
              <WarrantyDaysForm
                productId={product.id}
                unitId={warrantyEditing.id}
                serial={warrantyEditing.serial}
                warrantyDays={
                  warrantyEditing.warrantyDays === null
                    ? ""
                    : String(warrantyEditing.warrantyDays)
                }
                organizationDays={
                  organizationWarranty?.ok
                    ? (organizationWarranty.settings?.warrantyDays ?? null)
                    : null
                }
              />
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

          {/* Un `?unidad=` que no resuelve ocupa el lugar del panel y **lo dice**, con la vuelta a
              la lista a mano. Antes no pasaba nada: ni panel, ni aviso, ni error (N-10). */}
          {panelMissing ? (
            <SectionCard
              id="unidad-titulo"
              title="Unidad"
              icon="smartphone"
              className="mt-6"
            >
              <p className="text-sm">{UNIT_PANEL_NOT_FOUND_MESSAGE}</p>
              <p className="mt-3">
                <Link
                  href={`${listHref(base, filters)}#unidades-titulo`}
                  className={secondaryLinkClass}
                >
                  Volver a la lista
                </Link>
              </p>
            </SectionCard>
          ) : null}

          {panelUnit && panelHistory ? (
            <UnitPanel
              unit={panelUnit}
              view={filters.view}
              detailHref={panelHref(base, filters, panelUnit.id, "detalle")}
              historyHref={panelHref(base, filters, panelUnit.id, "historial")}
              closeHref={`${listHref(base, filters)}#unidades-titulo`}
              history={panelHistory}
              isAdmin={isAdmin}
              timeZone={timeZone}
              actorLabel={actorLabel}
              origin={origin(panelUnit)}
              extras={actionsFor(panelUnit)}
            />
          ) : null}

          <SectionCard
            id="unidades-titulo"
            title="Unidades"
            icon="smartphone"
            className="mt-6"
          >
            <p className="text-sm text-muted">
              {availableText(product.quantityAvailable)}. El saldo cuenta las
              disponibles y las reservadas: lo que está en reparación o en
              revisión queda fuera.
            </p>

            {/* El filtro por estado, por la URL, con la cantidad de cada uno. Los contadores del
                Resumen de la ficha enlazan acá (D-5): esta es la pantalla que les faltaba. */}
            <nav aria-label="Filtrar por estado" className="mt-4">
              <ul className="flex flex-wrap gap-2">
                <li>
                  <Link
                    href={listHref(base, filters, { status: null, page: 1 })}
                    aria-current={filters.status === null ? "true" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold ${
                      filters.status === null
                        ? "border-primary bg-primary-soft text-on-primary-soft"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {ALL_UNITS_LABEL}
                  </Link>
                </li>
                {STATUS_ORDER.map((status) => (
                  <li key={status}>
                    <Link
                      href={listHref(base, filters, { status, page: 1 })}
                      aria-current={
                        filters.status === status ? "true" : undefined
                      }
                      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-semibold ${
                        filters.status === status
                          ? "border-primary bg-primary-soft text-on-primary-soft"
                          : "border-border text-muted hover:text-foreground"
                      }`}
                    >
                      {UNIT_STATUS_LABEL[status]}
                      {/* Si el recuento no se pudo leer, el chip va **sin número** y el aviso de
                          abajo lo dice: un cero afirmaría que no hay ninguna unidad en ese estado
                          (I-2). `undefined` es un producto por cantidad, que no llega acá. */}
                      {counts ? (
                        <span className="tabular-nums">{counts[status]}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            {/* Si el recuento falló, los chips quedan sin número y **se dice**. Antes esta rama no
                existía y los números desaparecían en silencio (I-2). */}
            {counts === null ? (
              <p className="mt-2 text-sm text-muted">
                {UNIT_COUNTS_UNAVAILABLE_MESSAGE}
              </p>
            ) : null}

            {/* La búsqueda es un GET: conserva el estado elegido en un campo oculto y no arrastra
                la página, porque con otro conjunto de resultados la página 3 no es la misma. */}
            <form
              method="get"
              action={base}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              {filters.status ? (
                <input
                  type="hidden"
                  name="estado"
                  value={STATUS_VALUE[filters.status]}
                />
              ) : null}
              {/* `flex flex-col gap-1`, como la búsqueda de Clientes. Sin eso el `label` queda en
                  línea con el `input` y el texto toca el campo: lo encontró el recorrido del
                  usuario del 2026-11-01. */}
              <div className="flex min-w-0 grow flex-col gap-1 sm:grow-0">
                <label htmlFor="imei" className={labelClass}>
                  {SEARCH_LABEL}
                </label>
                <input
                  id="imei"
                  name="imei"
                  type="search"
                  inputMode="numeric"
                  autoComplete="off"
                  defaultValue={filters.serial}
                  className={`${inputClass} sm:w-64`}
                />
              </div>
              <button type="submit" className={secondaryButtonClass}>
                Buscar
              </button>
              {filters.status !== null || filters.serial ? (
                <Link
                  href={base}
                  className={`${secondaryLinkClass} inline-flex min-h-11 items-center`}
                >
                  Restablecer
                </Link>
              ) : null}
            </form>

            {units?.search === "too_short" ? (
              <p role="status" className="mt-3 text-sm text-muted">
                {searchTooShortMessage(UNIT_SEARCH_MIN_LENGTH)}
              </p>
            ) : null}

            {/* Una lectura que no se pudo hacer se **anuncia**, y ahora la rama es alcanzable: el
                `catch` vive en `list-data.ts` y la prueba lo fuerza (I-2, AC-10). */}
            {units === null ? (
              <p className="mt-3">{UNITS_UNAVAILABLE_MESSAGE}</p>
            ) : list.length === 0 ? (
              <p className="mt-3">
                {units.productHasUnits
                  ? NO_UNITS_FOR_FILTER_MESSAGE
                  : NO_UNITS_MESSAGE}
              </p>
            ) : (
              <>
                {/* `relative` no es decorativo y su ausencia costó un desbordamiento a 375 px
                    (AC-13). Los `sr-only` de la tabla —el encabezado «Acciones» y el IMEI que cada
                    acción agrega a su nombre accesible— están **posicionados en absoluto**, así que
                    sin un ancestro posicionado resuelven contra el documento: quedan en x≈1000,
                    escapan de este contenedor que scrollea y estiran el `scrollWidth` del `html`.
                    Con `relative`, este div es su bloque contenedor y su desbordamiento queda acá.
                    La tabla de antes de la 24.5.2 no lo sufría porque era angosta: con una sola
                    sección y pocas columnas, sus `sr-only` caían dentro de los 375 px. */}
                <div className="relative mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Unidades de {product.name}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className={tableHeadCellClass}>
                          IMEI o serie
                        </th>
                        <th scope="col" className={tableHeadCellClass}>
                          Estado
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
                        {/* Origen y Alta salieron de la tabla el 2026-11-01: con ocho columnas de
                            datos la tabla medía 1.006 px y se desplazaba desde 1280 para abajo. Las
                            dos siguen en el panel, que ahora es el único lugar donde se ven, y la
                            lámina 10 tiene cinco columnas, así que esto acerca en vez de alejar. */}
                        <th scope="col" className={tableHeadCellClass}>
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((unit) => (
                        <tr
                          key={unit.id}
                          // El resaltado de la fila abierta es solo eso: no es una selección, y la
                          // lámina advierte que no se mezclen. No hay casilla porque no hay
                          // operación masiva (alcance excluido).
                          className={
                            unit.id === panelUnit?.id ? "bg-primary-soft" : ""
                          }
                        >
                          <td className={`${tableCellClass} font-mono`}>
                            {/* `linkClass` y no `secondaryLinkClass`: con la caja con borde, el
                                IMEI se leía como **un botón más** entre los de la fila, y el
                                recorrido del usuario del 2026-11-01 terminó sin encontrar el
                                panel. Un enlace subrayado dice que lleva a algún lado; una caja
                                con borde, al lado de otras cinco, no dice nada. */}
                            <Link
                              href={panelHref(base, filters, unit.id)}
                              className={`${linkClass} inline-flex min-h-11 items-center`}
                            >
                              {unit.serial}
                            </Link>
                          </td>
                          <td className={tableCellClass}>{statusCell(unit)}</td>
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
                            <div className="flex items-center justify-end">
                              {rowActions(unit)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  className="mt-4"
                  page={units.page}
                  pageCount={units.pageCount}
                  rangeText={shownRangeText({
                    page: units.page,
                    pageSize: UNITS_PAGE_SIZE,
                    shown: list.length,
                    total: units.total,
                    singular: "unidad",
                    plural: "unidades",
                  })}
                  hrefFor={pageHref}
                />
              </>
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
        </>
      ) : null}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
