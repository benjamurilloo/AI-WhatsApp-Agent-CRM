import { IPHONE_PROFILE } from "./iphone";

// Perfiles de rubro (ADR 0024, punto 13; brief-29.2, D-8). Un perfil son datos: las capacidades que
// activa y lo que copia a la organización. Las definiciones de atributos las escribe catalog, que es
// dueño de sus tablas: el script de capacidades le pasa la lista en la misma transacción. Cambiar
// una plantilla no toca las organizaciones que ya la copiaron.

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
export type ProfileCapability = "variants" | "serialized_units";

// Los grados de las unidades que copia el perfil al activar serialized_units (brief-29.5, D-5). Los
// escribe inventory, dueño de su tabla, como catalog los atributos.
export type ProfileGrade = { name: string; description: string | null };

export type Profile = {
  name: string;
  label: string;
  capabilities: ProfileCapability[];
  attributes: ProfileAttribute[];
  grades: ProfileGrade[];
};

export const PROFILES: readonly Profile[] = [IPHONE_PROFILE];

export function getProfile(name: string): Profile | undefined {
  return PROFILES.find((profile) => profile.name === name);
}
