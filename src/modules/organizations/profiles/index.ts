import { IPHONE_PROFILE } from "./iphone";

// Perfiles de rubro (ADR 0024, punto 13; brief-29.2, D-8). Un perfil son datos: las capacidades que
// activa y lo que copia a la organización. Las definiciones de atributos las escribe catalog, que es
// dueño de sus tablas: el script de capacidades le pasa la lista en la misma transacción. Cambiar
// una plantilla no cambia lo que las organizaciones ya copiaron; desde la 29.7.2 y la 29.7.3 (U-4), volver
// a correr el script completa lo que falta (el medio «Permuta», los valores de la cotización).

export type ProfileAttribute = {
  key: string;
  name: string;
  type: "text" | "number" | "boolean" | "option";
  isRequired: boolean;
  isVariant: boolean;
  options: string[];
};

// Las capacidades que un perfil puede activar. No importa el tipo del servicio (la carpeta no sale
// del módulo por una ruta relativa): si un valor de acá no existiera en el enum capability, el
// script de activación, que se lo pasa a activateCapability, deja de compilar.
export type ProfileCapability =
  "variants" | "serialized_units" | "repairs" | "trade_ins" | "appointments";

// Los grados de las unidades que copia el perfil al activar serialized_units (brief-29.5, D-5). Los
// escribe inventory, dueño de su tabla, como catalog los atributos.
export type ProfileGrade = { name: string; description: string | null };

// Los tipos de reparación de ejemplo que copia el perfil al activar repairs (brief-29.6, D-1), por
// nombre y sin precios: los precios son por modelo, y los modelos son de cada negocio. Los escribe
// service, dueño de su tabla.
export type ProfileRepairType = { name: string };

// Los puntos del checklist de un usado que copia el perfil al activar trade_ins (brief-29.7, D-3), con
// si son obligatorios para aceptar el equipo. Los escribe tradeins, dueño de su tabla. Desde la 29.7.3
// (brief-29.7.3, D-3), el nombre del tipo de reparación que necesita el equipo si el punto no pasa.
export type ProfileChecklistItem = {
  name: string;
  isMandatory: boolean;
  repairType?: string;
};

// Los valores sueltos de la cotización de un usado (brief-29.7.3, D-1), de ejemplo. La reparación de la
// batería va por nombre: el script la busca entre los tipos de la organización.
export type ProfileTradeInQuote = {
  batteryThreshold: number;
  rangePercent: string;
  roundingStep: string;
  roundingCurrency: string;
  batteryRepairType: string;
};

// Los turnos que copia el perfil al activar appointments (brief-29.10, D-1 y U-3): la duración de una
// franja, el cupo y los motivos, de ejemplo. Los escribe appointments, dueño de sus tablas.
export type ProfileAppointments = {
  slotMinutes: number;
  capacity: number;
  reasons: string[];
};

export type Profile = {
  name: string;
  label: string;
  capabilities: ProfileCapability[];
  attributes: ProfileAttribute[];
  grades: ProfileGrade[];
  repairTypes: ProfileRepairType[];
  tradeInChecklist: ProfileChecklistItem[];
  tradeInQuote: ProfileTradeInQuote | null;
  // Los días de garantía de una unidad vendida y de una reparación entregada (brief-29.9, D-1): el script
  // los copia a unit_settings y a service_settings, de ejemplo. Nulo, el perfil no los trae.
  warrantyDays: number | null;
  // Nulo, el perfil no trae turnos.
  appointments: ProfileAppointments | null;
};

export const PROFILES: readonly Profile[] = [IPHONE_PROFILE];

export function getProfile(name: string): Profile | undefined {
  return PROFILES.find((profile) => profile.name === name);
}
