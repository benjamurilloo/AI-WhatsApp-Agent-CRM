import Link from "next/link";
import type { ClientBalance } from "@/modules/cash";
import type { ClientTag } from "@/modules/crm";
import { Icon, type IconName } from "@/app/_components/icons";
import { moreActionItemClass } from "@/app/_components/more-action-styles";
import { MoreActions } from "@/app/_components/more-actions";
import { StatusBadge } from "@/app/_components/status-badge";
import { TagChip } from "@/app/_components/tag-chip";
import { formatMoney } from "@/shared/money";

// Las celdas de la lista de clientes (brief-24.4.2, D-2, D-3 y D-5): las comparten la tabla de
// escritorio y las tarjetas del teléfono. Reciben lo que la página ya compuso, sin leer nada.

// «En curso» de un cliente (D-3): lo que tiene abierto en cada módulo, con su capacidad. Sin ninguna
// clave, el módulo no se leyó.
export type OpenWork = {
  repairs?: number;
  appointments?: number;
  orders?: number;
  conversations?: number;
};

const OPEN_WORK: {
  key: keyof OpenWork;
  icon: IconName;
  singular: string;
  plural: string;
}[] = [
  {
    key: "repairs",
    icon: "wrench",
    singular: "reparación",
    plural: "reparaciones",
  },
  {
    key: "appointments",
    icon: "calendar",
    singular: "turno",
    plural: "turnos",
  },
  { key: "orders", icon: "list", singular: "pedido", plural: "pedidos" },
  {
    key: "conversations",
    icon: "messageCircle",
    singular: "conversación",
    plural: "conversaciones",
  },
];

// Hasta dos líneas y «+N» con las demás, como 01.
const OPEN_WORK_LIMIT = 2;

export function OpenWorkCell({ work }: { work: OpenWork }) {
  const items = OPEN_WORK.flatMap((item) => {
    const total = work[item.key] ?? 0;
    return total > 0 ? [{ ...item, total }] : [];
  });
  if (items.length === 0) {
    return (
      <span className="flex items-center gap-2 text-sm text-muted">
        <Icon name="circleMinus" className="size-4 shrink-0" />
        Sin operaciones abiertas
      </span>
    );
  }
  const hidden = items.slice(OPEN_WORK_LIMIT);
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.slice(0, OPEN_WORK_LIMIT).map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <Icon name={item.icon} className="size-4 shrink-0 text-muted" />
          {item.total} {item.total === 1 ? item.singular : item.plural}
        </li>
      ))}
      {hidden.length > 0 ? (
        <li className="text-muted">
          +{hidden.length}
          <span className="sr-only">
            {" "}
            más:{" "}
            {hidden
              .map(
                (item) =>
                  `${item.total} ${item.total === 1 ? item.singular : item.plural}`,
              )
              .join(", ")}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

// El saldo (D-2): una línea por moneda, sin sumar. null es que la lectura falló: nunca un cero.
export const BALANCE_UNAVAILABLE_TEXT = "No disponible";
export const NO_BALANCE_TEXT = "Sin saldo pendiente";

export function BalanceCell({
  balances,
}: {
  balances: ClientBalance[] | null;
}) {
  if (balances === null) {
    return (
      <span className="text-sm whitespace-nowrap text-muted">
        {BALANCE_UNAVAILABLE_TEXT}
      </span>
    );
  }
  if (balances.length === 0) {
    return (
      <span className="text-sm whitespace-nowrap text-muted">
        {NO_BALANCE_TEXT}
      </span>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {balances.map((row) => (
        <li key={row.currency} className="flex flex-col items-start gap-1">
          {row.owed !== "0.00" ? (
            <>
              <span className="font-semibold tabular-nums">
                {formatMoney(row.owed, row.currency)}
              </span>
              <StatusBadge tone="warning" icon="alert">
                Pendiente
              </StatusBadge>
            </>
          ) : (
            <span className="text-sm tabular-nums">
              A favor {formatMoney(row.inFavor, row.currency)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// En las tarjetas del teléfono, como 06: la deuda en un recuadro ámbar con «Saldo», y sin deuda una
// insignia verde. Lo que tiene a favor va como texto, igual que en la tabla.
export function BalanceBox({ balances }: { balances: ClientBalance[] | null }) {
  const owed = balances?.filter((row) => row.owed !== "0.00") ?? [];
  if (balances === null || owed.length === 0) {
    const favor = balances?.filter((row) => row.inFavor !== "0.00") ?? [];
    return (
      <div className="flex flex-col items-start gap-1">
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${balances === null ? "bg-surface-muted text-muted" : "bg-success-soft text-on-success-soft"}`}
        >
          {balances === null ? BALANCE_UNAVAILABLE_TEXT : NO_BALANCE_TEXT}
        </span>
        {favor.map((row) => (
          <span key={row.currency} className="text-sm tabular-nums">
            A favor {formatMoney(row.inFavor, row.currency)}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-warning-soft px-3 py-2 text-on-warning-soft">
      <p className="text-xs font-semibold">Saldo</p>
      <ul className="flex flex-col gap-0.5">
        {owed.map((row) => (
          <li key={row.currency} className="font-semibold tabular-nums">
            {formatMoney(row.owed, row.currency)}
          </li>
        ))}
      </ul>
      <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
        <Icon name="alert" className="size-4" />
        Pendiente
      </p>
    </div>
  );
}

// Hasta tres etiquetas por fila y «+N» con las demás (brief-16.1, D-9). El «+N» dice en texto
// cuántas faltan; la lista completa está en la ficha.
const ROW_TAG_LIMIT = 3;

export function RowTags({ tags }: { tags: ClientTag[] }) {
  if (tags.length === 0) return <span className="text-muted">—</span>;
  const hidden = tags.length - ROW_TAG_LIMIT;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.slice(0, ROW_TAG_LIMIT).map((tag) => (
        <li key={tag.id}>
          <TagChip name={tag.name} color={tag.color} isActive={tag.isActive} />
        </li>
      ))}
      {hidden > 0 ? (
        <li className="text-sm text-muted">
          +{hidden}
          <span className="sr-only"> etiquetas más</span>
        </li>
      ) : null}
    </ul>
  );
}

// El «⋮» de cada fila (D-5): «Ver ficha» y, para un admin, «Editar». El nombre del menú lleva el
// del cliente, para que cada fila tenga el suyo.
export function RowActions({
  clientId,
  name,
  isAdmin,
  idPrefix,
}: {
  clientId: string;
  name: string;
  isAdmin: boolean;
  idPrefix: string;
}) {
  return (
    <MoreActions
      id={`${idPrefix}-${clientId}`}
      label={`Más acciones de ${name}`}
      iconOnly
    >
      <li>
        <Link href={`/clientes/${clientId}`} className={moreActionItemClass}>
          <Icon name="user" className="size-4" />
          Ver ficha
        </Link>
      </li>
      {isAdmin ? (
        <li>
          <Link
            href={`/clientes/${clientId}?editar=1`}
            className={moreActionItemClass}
          >
            <Icon name="pencil" className="size-4" />
            Editar
          </Link>
        </li>
      ) : null}
    </MoreActions>
  );
}
