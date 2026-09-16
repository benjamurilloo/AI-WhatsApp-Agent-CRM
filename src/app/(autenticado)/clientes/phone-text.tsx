import type { ClientPhone } from "@/modules/crm";
import { phoneDisplay } from "./phone-display";

// Teléfono en pantalla (brief-5.3, D-1): lo visible queda fuera del árbol de accesibilidad y el
// lector de pantalla recibe el texto completo. Componente de servidor: no serializa nada extra.
export function PhoneText({
  phone,
  emptyText,
}: {
  phone: ClientPhone;
  emptyText: "—" | "Sin teléfono";
}) {
  const display = phoneDisplay(phone, emptyText);
  if (display.visible === display.spoken) {
    return <span className="tabular-nums">{display.visible}</span>;
  }
  return (
    <>
      <span aria-hidden="true" className="tabular-nums">
        {display.visible}
      </span>
      <span className="sr-only">{display.spoken}</span>
    </>
  );
}
