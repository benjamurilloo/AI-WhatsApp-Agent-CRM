"use client";

import { useState } from "react";
import { Picker } from "./nuevo/picker";
import { searchOrderClientsAction } from "./actions";

// El filtro por cliente del listado (brief-24.6.1, D-11; lámina 01). La lámina dibuja un
// desplegable «Todos los clientes»; un `<select>` con todos los clientes de la organización no
// escala, así que acá es el mismo combobox del alta: `Picker`, que es ARIA 1.2 con flechas, Enter
// y Escape (brief-15.2, D-5 y D-6).
//
// Manda **dos parámetros** a propósito, y esa es la decisión que hace que ande en los dos modos:
//
//   - `cliente`, el id, que solo se llena cuando se elige una opción de la lista. Es exacto, así
//     que dos clientes con el mismo nombre no se confunden, y es lo que ya mandan los enlaces que
//     la ficha de un cliente viene generando desde la 19.2.
//   - `clienteNombre`, lo que se escribió. **Sin JavaScript no hay id**, y este es el único dato
//     que llega; la pantalla lo resuelve por nombre exacto y, si hay más de uno, lo dice en vez de
//     elegir uno por su cuenta.
//
// Escribir después de haber elegido **borra el id**: si no, cambiar el texto dejaría el filtro
// apuntando al cliente anterior, que es el error clásico de un combobox con un campo oculto.
export function ClientFilter({
  id,
  className,
  initialId,
  initialText,
}: {
  id: string;
  className: string;
  initialId: string;
  initialText: string;
}) {
  const [client, setClient] = useState({ id: initialId, text: initialText });
  return (
    <>
      <input type="hidden" name="cliente" value={client.id} />
      <Picker
        id={id}
        name="clienteNombre"
        value={client.text}
        placeholder="Todos los clientes"
        className={className}
        load={searchOrderClientsAction}
        onChoose={(option) => setClient({ id: option.id, text: option.label })}
        onType={(text) => setClient({ id: "", text })}
      />
    </>
  );
}
