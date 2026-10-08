// Las 24 jurisdicciones de Argentina, con su código ISO 3166-2 (brief-17.1, D-4). La usan el CHECK
// de la base, la validación del servicio y los selectores de las pantallas, así que no pueden
// separarse. Se guarda el código; se muestra el nombre. En el orden en que se ofrecen.
export const PROVINCES = {
  "AR-C": "Ciudad Autónoma de Buenos Aires",
  "AR-B": "Buenos Aires",
  "AR-K": "Catamarca",
  "AR-H": "Chaco",
  "AR-U": "Chubut",
  "AR-X": "Córdoba",
  "AR-W": "Corrientes",
  "AR-E": "Entre Ríos",
  "AR-P": "Formosa",
  "AR-Y": "Jujuy",
  "AR-L": "La Pampa",
  "AR-F": "La Rioja",
  "AR-M": "Mendoza",
  "AR-N": "Misiones",
  "AR-Q": "Neuquén",
  "AR-R": "Río Negro",
  "AR-A": "Salta",
  "AR-J": "San Juan",
  "AR-D": "San Luis",
  "AR-Z": "Santa Cruz",
  "AR-S": "Santa Fe",
  "AR-G": "Santiago del Estero",
  "AR-V": "Tierra del Fuego",
  "AR-T": "Tucumán",
} as const;

export type ProvinceCode = keyof typeof PROVINCES;

export const PROVINCE_CODES = Object.keys(PROVINCES) as ProvinceCode[];

export function isProvinceCode(value: unknown): value is ProvinceCode {
  return typeof value === "string" && Object.hasOwn(PROVINCES, value);
}
