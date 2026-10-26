import type { Warranty } from "@/modules/inventory";

// La garantía como texto (brief-29.9, D-3), igual en la unidad, la ficha del cliente, la búsqueda por
// IMEI y las órdenes de servicio. El vencimiento es una fecha local de la organización, AAAA-MM-DD, y
// la garantía cubre todo ese día.

function dayText(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function warrantyText(warranty: Warranty): string {
  switch (warranty.status) {
    case "in_warranty":
      return `En garantía hasta el ${dayText(warranty.endsOn)}`;
    case "expired":
      return `Garantía vencida el ${dayText(warranty.endsOn)}`;
    case "returned":
      return "Volvió al local: sin garantía";
    case "not_configured":
      return "Garantía sin configurar";
  }
}

// El inicio, los días y de dónde salen, para la unidad (D-3).
export function warrantyDaysText(warranty: Warranty): string | null {
  if (warranty.status !== "in_warranty" && warranty.status !== "expired") {
    return null;
  }
  const days = warranty.days === 1 ? "1 día" : `${warranty.days} días`;
  const since = `${days} desde el ${dayText(warranty.startsOn)}`;
  return warranty.source === "unit"
    ? `${since}, propios de la unidad`
    : `${since}, los de la organización`;
}
