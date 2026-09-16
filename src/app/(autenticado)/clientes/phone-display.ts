import type { ClientPhone } from "@/modules/crm";

// Presentación del teléfono (brief-5.3, D-1): E.164 tal como está guardado para admin, y los
// dígitos que crm ya dejó para viewer. Lo visible y lo que lee un lector de pantalla van por
// separado: "•••• 1234" no se entiende en voz alta.

export type PhoneDisplay = { visible: string; spoken: string };

export function phoneDisplay(
  phone: ClientPhone,
  emptyText: "—" | "Sin teléfono",
): PhoneDisplay {
  if (phone === null) return { visible: emptyText, spoken: "Sin teléfono" };
  if (phone.kind === "full") {
    return { visible: phone.e164, spoken: phone.e164 };
  }
  if (phone.lastDigits === "") {
    return { visible: "••••", spoken: "Teléfono enmascarado" };
  }
  return {
    visible: `•••• ${phone.lastDigits}`,
    spoken: `Teléfono enmascarado, termina en ${phone.lastDigits}`,
  };
}
