import type { ReactNode } from "react";
import Link from "next/link";
import type { NamedAuditActor } from "@/modules/audit";
import type { ProductUnit } from "@/modules/inventory";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { StatusBadge } from "@/app/_components/status-badge";
import { secondaryLinkClass } from "@/app/_components/form-styles";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { formatQuantity } from "@/shared/quantity";
import {
  batteryText,
  HISTORY_AUDIT_ADMIN_ONLY_MESSAGE,
  HISTORY_AUDIT_UNAVAILABLE_MESSAGE,
  HISTORY_EMPTY_MESSAGE,
  HISTORY_MOVEMENTS_UNAVAILABLE_MESSAGE,
  historyCapMessage,
  movementTypeLabel,
  unitAuditActionLabel,
  unitAuditChangedText,
  UNIT_ORIGIN_LABEL,
  UNIT_STATUS_ICON,
  UNIT_STATUS_LABEL,
  UNIT_STATUS_TONE,
} from "./messages";
import type { UnitPanelView } from "./filters";
import type { UnitHistory } from "./unit-history";

// El panel de una unidad (brief-24.5.2, D-2 y D-3; lámina 10 en escritorio y 14 en el teléfono).
// Dos pestañas, Detalle e Historial, por la URL: son enlaces de verdad, así que funcionan sin
// JavaScript y `SubNav` les pone el `aria-current` y el recorrido por teclado.
//
// No es un diálogo modal: es una tarjeta más de la página, arriba de la lista. La lámina advierte
// que un panel que **parece** modal sin serlo atrapa al usuario; acá no hay nada que atrapar,
// porque cerrar es un enlace a la lista.

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

export function UnitPanel({
  unit,
  view,
  detailHref,
  historyHref,
  closeHref,
  history,
  isAdmin,
  timeZone,
  actorLabel,
  origin,
  extras,
}: {
  unit: ProductUnit;
  view: UnitPanelView;
  detailHref: string;
  historyHref: string;
  closeHref: string;
  history: UnitHistory;
  isAdmin: boolean;
  timeZone: string;
  // Lo arma la página con `auditActorLabels`, que resuelve el emisor de una credencial de servicio
  // leyendo `ingestion`. El panel no lee nada: recibe la función ya resuelta (N-8).
  actorLabel: (actor: NamedAuditActor) => string;
  // El origen ya compuesto: la etiqueta a secas, o el enlace al comprobante del usado. Lo arma la
  // página porque el comprobante vive en `tradeins`.
  origin?: ReactNode;
  // Lo que compone la página desde otros módulos: su pedido, su venta, sus órdenes de reparación,
  // su usado y su garantía. Entra ya armado para que el panel no lea nada.
  extras: ReactNode;
}) {
  return (
    <SectionCard
      id="unidad-titulo"
      title="Unidad"
      icon="smartphone"
      className="mt-6"
      description={unit.serial}
    >
      <nav aria-label="Vistas de la unidad" className="border-b border-border">
        <ul className="-mb-px flex gap-x-5">
          {(
            [
              ["detalle", "Detalle", detailHref],
              ["historial", "Historial", historyHref],
            ] as const
          ).map(([key, label, href]) => (
            <li key={key}>
              <Link
                href={href}
                aria-current={view === key ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-1 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  view === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:border-border-strong hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {view === "detalle" ? (
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="IMEI o serie">
            <span className="font-mono">{unit.serial}</span>
          </Field>
          <Field label="Estado">
            <StatusBadge
              tone={UNIT_STATUS_TONE[unit.status]}
              icon={UNIT_STATUS_ICON[unit.status]}
            >
              {UNIT_STATUS_LABEL[unit.status]}
            </StatusBadge>
          </Field>
          <Field label="Grado">
            {unit.grade?.name ?? <span className="text-muted">Sin grado</span>}
          </Field>
          <Field label="Batería">
            {/* Una batería vacía es «Sin medir», no cero: lo pide la lámina 10. */}
            {unit.batteryHealth === null ? (
              <span className="text-muted">Sin medir</span>
            ) : (
              <span className="tabular-nums">
                {batteryText(unit.batteryHealth)}
              </span>
            )}
          </Field>
          <Field label="Precio">
            {unit.price ? (
              <span className="tabular-nums">
                {formatMoney(unit.price.amount, unit.price.currency)}
              </span>
            ) : (
              <span className="text-muted">El del producto</span>
            )}
          </Field>
          {/* El costo solo para un admin (FR-PROD-21). No se dibuja el campo vacío para un viewer:
              un campo «Costo» en blanco ya informa que existe un costo. */}
          {isAdmin ? (
            <Field label="Costo">
              {unit.cost ? (
                <span className="tabular-nums">
                  {formatMoney(unit.cost.amount, unit.cost.currency)}
                </span>
              ) : (
                <span className="text-muted">Sin costo</span>
              )}
            </Field>
          ) : null}
          {/* El origen lo compone la página, porque el comprobante de un usado sale de otro
              módulo. Desde el 2026-11-01 el panel es **el único lugar** donde se ve: la columna
              Origen salió de la tabla para que entrara a 1280 px, y con ella se habría ido el
              enlace al comprobante si el panel siguiera mostrando solo la etiqueta. */}
          <Field label="Origen">
            {origin ?? UNIT_ORIGIN_LABEL[unit.origin]}
          </Field>
          <Field label="Alta">
            <span className="tabular-nums">
              {formatShortDateTime(unit.createdAt, timeZone)}
            </span>
          </Field>
        </dl>
      ) : (
        <div className="mt-4">
          {/* Cada fuente dice por su cuenta si se pudo leer. Una lectura que falló se **anuncia**:
              nunca se dibuja como «sin eventos», que afirmaría que no pasó nada (I-2). */}
          {history.movements === null ? (
            <p className="flex items-start gap-2 text-sm text-muted">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              <span>{HISTORY_MOVEMENTS_UNAVAILABLE_MESSAGE}</span>
            </p>
          ) : null}
          {history.audit === null ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-muted">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              <span>{HISTORY_AUDIT_UNAVAILABLE_MESSAGE}</span>
            </p>
          ) : null}
          {history.audit === undefined ? (
            <p className="text-sm text-muted">
              {HISTORY_AUDIT_ADMIN_ONLY_MESSAGE}
            </p>
          ) : null}

          {history.events.length === 0 &&
          history.movements !== null &&
          history.audit !== null ? (
            <p className="mt-3">{HISTORY_EMPTY_MESSAGE}</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-3 text-sm">
              {history.events.map((event) => (
                <li
                  key={`${event.kind}-${event.id}`}
                  className="border-l-2 border-border pl-3"
                >
                  <p className="flex flex-wrap items-center gap-x-2">
                    {/* Un movimiento y un cambio de estado se nombran distinto a propósito: una
                        reserva o un pase a revisión **no** son una entrada ni una salida física, y
                        la lámina pide que no lo parezcan. */}
                    {event.kind === "movement" ? (
                      <>
                        <span className="font-semibold">
                          {movementTypeLabel(event.type)}
                        </span>
                        <span className="tabular-nums text-muted">
                          {formatQuantity(event.quantity)}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold">
                        {/* Cada acción con su nombre. Antes todas decían «Cambio de estado», así
                            que un alta, una corrección, un cambio de precio y uno de costo se
                            dibujaban igual y sin dato (N-2). */}
                        {unitAuditActionLabel(event.action)}
                        {event.to ? (
                          <>
                            {": "}
                            {UNIT_STATUS_LABEL[
                              event.to as keyof typeof UNIT_STATUS_LABEL
                            ] ?? event.to}
                          </>
                        ) : null}
                      </span>
                    )}
                    <span className="tabular-nums text-muted">
                      {formatShortDateTime(event.at, timeZone)}
                    </span>
                  </p>
                  {event.kind === "movement" ? (
                    <p className="mt-0.5 text-muted">
                      {event.reason}
                      {event.authorName ? ` · ${event.authorName}` : ""}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-muted">
                      {/* El motivo de una baja desde «en revisión» vive **solo** acá: esa baja no
                          es un movimiento de stock (U-2 de la 29.6.2). Es lo que esta subfase vino
                          a destapar. Y si la acción no es de estado, se dice qué campo cambió, que
                          es lo que antes faltaba (N-2). */}
                      {event.reason ? `${event.reason} · ` : ""}
                      {event.changed.length > 0
                        ? `${unitAuditChangedText(event.changed)} `
                        : ""}
                      {/* El autor con la etiqueta del proyecto, no una propia: `auditActorLabel`
                          resuelve el emisor de una credencial de servicio y lo usan todas las demás
                          vistas de auditoría. Tener una tercera forma de nombrar lo mismo era el
                          hallazgo N-8. */}
                      {actorLabel(event.actor)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {/* El aviso de tope mira **las dos fuentes**: la auditoría se corta en 25 entradas y antes
              se recortaba en silencio (N-1). `empty:hidden` lo esconde cuando no hay nada que
              avisar, así que no aparece un párrafo vacío. */}
          <p className="mt-3 text-sm text-muted empty:hidden">
            {historyCapMessage({
              movementsShown: history.movementsShown,
              movementsLimit: history.movementsLimit,
              auditShown: history.auditShown,
              auditTotal: history.auditTotal,
            })}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {extras}
        {/* `min-h-11` son los 44 px de AC-13. No está de más: `secondaryLinkClass` da **38 px**
            —`px-3 py-2 text-sm` más el borde—, y la prueba que los mide lo encontró así. Se
            corrige acá y no en la clase compartida, que la usa todo el proyecto y cambiarla es
            otro cambio (ver O-4). */}
        <Link
          href={closeHref}
          className={`${secondaryLinkClass} min-h-11 min-w-11`}
        >
          Cerrar
          <span className="sr-only"> el panel de {unit.serial}</span>
        </Link>
      </div>
    </SectionCard>
  );
}
