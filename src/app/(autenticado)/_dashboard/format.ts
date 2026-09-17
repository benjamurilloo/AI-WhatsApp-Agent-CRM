// Formato de los valores del dashboard (brief-7.4). El redondeo es de la presentación: el servicio
// devuelve los valores sin redondear y acá se muestran con un decimal (brief-7.1, D-3).

const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatCount(value: number): string {
  return integer.format(value);
}

// "14,0" — un decimal siempre, para que dos valores vecinos se lean alineados.
export function formatDecimal(value: number): string {
  return oneDecimal.format(value);
}

export function formatPercentage(value: number): string {
  return `${oneDecimal.format(value)} %`;
}

export function formatMinutes(value: number): string {
  return `${oneDecimal.format(value)} min`;
}
