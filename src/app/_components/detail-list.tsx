import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

// Datos de un detalle como lista de definición, con un ícono opcional por fila (brief-15.4).
// Un valor vacío se muestra como «—» en texto secundario.

export type DetailItem = {
  label: string;
  value: ReactNode;
  icon?: IconName;
  // Para valores largos, como una descripción: respeta los saltos de línea.
  multiline?: boolean;
};

export function DetailList({ items }: { items: DetailItem[] }) {
  return (
    <dl className="-mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:mt-0 sm:grid-cols-[minmax(8rem,auto)_1fr] sm:gap-y-3">
      {items.map((item) => {
        const empty =
          item.value === null || item.value === undefined || item.value === "";
        return (
          <div key={item.label} className="contents">
            <dt className="mt-2 flex items-center gap-2 font-semibold text-muted sm:mt-0">
              {item.icon ? <Icon name={item.icon} className="size-4" /> : null}
              {item.label}
            </dt>
            <dd
              className={`min-w-0 break-words ${empty ? "text-muted" : "text-foreground"} ${item.multiline ? "whitespace-pre-line" : ""}`}
            >
              {empty ? "—" : item.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
