import type { OrderDetail } from "@/modules/orders";
import { AUDIT_PAGE_SIZE } from "@/modules/audit";
import type { OrderAuditEntry } from "@/modules/orders";
import { AuditCard } from "@/app/_components/audit-card";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { formatShortDateTime } from "@/app/_format/date-time";
import { auditActionLabel, describeAuditDiff } from "./audit-summary";

// La pestaña Actividad de la ficha (brief-24.6.1, V-1): la cronología del pedido y, para `admin`,
// su historia de auditoría.
//
// El stepper viene de la lámina 05, que lo dibuja arriba de una ficha sin pestañas. Como la ficha
// sí lleva pestañas (V-1), la cronología vive acá, que es donde la v2 dice que va: «Actividad
// reutiliza la cronología con actor, fecha y cambio».
//
// Un `viewer` ve la cronología y **no** la auditoría: el servidor no se la entrega, igual que en
// la ficha del cliente. No es que se oculte en la pantalla; no se pide.

type Step = {
  label: string;
  icon: "calendar" | "circleCheck" | "truck" | "circleX";
  at: Date | null;
};

function steps(order: OrderDetail): Step[] {
  const created: Step = {
    label: "Creado",
    icon: "calendar",
    at: order.createdAt,
  };
  // Cancelado es final y reemplaza lo que faltaba: un pedido cancelado no va a entregarse, y
  // dejar «Entregado —» en gris sugeriría que todavía puede pasar.
  if (order.status === "cancelled") {
    return [
      created,
      ...(order.confirmedAt
        ? [
            {
              label: "Confirmado",
              icon: "circleCheck" as const,
              at: order.confirmedAt,
            },
          ]
        : []),
      { label: "Cancelado", icon: "circleX", at: order.cancelledAt },
    ];
  }
  return [
    created,
    { label: "Confirmado", icon: "circleCheck", at: order.confirmedAt },
    { label: "Entregado", icon: "truck", at: order.deliveredAt },
  ];
}

export function ActivityTab({
  order,
  audit,
  actorLabel,
  timeZone,
}: {
  order: OrderDetail;
  audit: {
    entries: OrderAuditEntry[];
    page: number;
    pageCount: number;
    total: number;
  } | null;
  actorLabel: ((actor: OrderAuditEntry["actor"]) => string) | null;
  timeZone: string;
}) {
  const list = steps(order);
  return (
    <div className="mt-6 flex flex-col gap-6">
      <SectionCard id="cronologia-titulo" title="Cronología" icon="history">
        <ol className="flex flex-col gap-4 sm:flex-row sm:gap-0">
          {list.map((step, index) => {
            const done = step.at !== null;
            return (
              <li
                key={step.label}
                className="flex min-w-0 flex-1 items-center gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
              >
                <span className="flex items-center gap-3 sm:w-full sm:gap-0">
                  {/* La línea entre pasos es decorativa: el estado de cada uno lo dice su
                      texto, no el color. */}
                  {index > 0 ? (
                    <span
                      aria-hidden
                      className={`hidden h-0.5 flex-1 sm:block ${done ? "bg-primary" : "bg-border"}`}
                    />
                  ) : null}
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full ${
                      done
                        ? "bg-primary text-on-primary"
                        : "border border-border bg-surface text-muted"
                    }`}
                  >
                    <Icon name={step.icon} className="size-5" />
                  </span>
                  {index < list.length - 1 ? (
                    <span
                      aria-hidden
                      className={`hidden h-0.5 flex-1 sm:block ${
                        list[index + 1]!.at !== null
                          ? "bg-primary"
                          : "bg-border"
                      }`}
                    />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {step.label}
                  </span>
                  <span className="block text-sm text-muted">
                    {step.at ? formatShortDateTime(step.at, timeZone) : "—"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </SectionCard>

      {audit ? (
        <AuditCard
          caption={`Historia del pedido ${order.displayNumber}`}
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
            `/pedidos/${order.id}?pestana=actividad${target > 1 ? `&historial=${target}` : ""}`
          }
        />
      ) : null}
    </div>
  );
}
