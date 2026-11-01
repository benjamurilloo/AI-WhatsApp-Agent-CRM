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
  // Dos columnas solo si se cumplen LAS DOS condiciones: la ventana llega a `sm` (640 px) y el
  // contenedor llega a `@md` (448 px) —brief-24.5.1-b, D-3, corregido por el bloqueante B-1 de la
  // revisión independiente—.
  // El `sm:` solo no alcanzaba: esta lista pasaba a dos columnas a los 640 px de ventana aunque
  // viviera en una columna lateral de 179 px, y entonces al valor le quedaban 27 px, así que «Sin
  // costo» se dibujaba «Sin cost / o». Pero el `@md` solo tampoco servía: una tarjeta a todo lo
  // ancho mide el ancho de la ventana menos 74 px, así que con 522 px de ventana ya llegaba a los
  // 448 y pasaba a dos columnas donde antes iba en una. Medido: a 522 px el contenedor da 448
  // justos, y a 500 px, 426. Esa franja de 522 a 639 px toca seis pantallas que esta subfase no
  // puede editar, y cambiarlas no estaba en su alcance.
  // Con las dos condiciones juntas, debajo de 640 px de ventana nunca hay dos columnas —idéntico
  // a antes— y arriba de 640 las hay solo si el contenedor da el ancho. Es exactamente la regla
  // que se quería: ni dos columnas en una pantalla chica, ni dos columnas en un hueco angosto.
  return (
    <div className="@container">
      <dl className="-mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:@md:mt-0 sm:@md:grid-cols-[minmax(8rem,auto)_1fr] sm:@md:gap-y-3">
        {items.map((item) => {
          const empty =
            item.value === null ||
            item.value === undefined ||
            item.value === "";
          return (
            <div key={item.label} className="contents">
              <dt className="mt-2 flex items-center gap-2 font-semibold text-muted sm:@md:mt-0">
                {item.icon ? (
                  <Icon name={item.icon} className="size-4" />
                ) : null}
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
    </div>
  );
}
