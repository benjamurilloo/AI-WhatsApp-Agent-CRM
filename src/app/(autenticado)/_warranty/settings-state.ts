// El estado del formulario de los días de garantía de la organización (brief-29.9, D-1), compartido por
// la pantalla de grados (unidades vendidas) y la lista de reparaciones (reparaciones entregadas).
export type WarrantySettingsState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: "warrantyDays" | null;
      message: string;
      values: { warrantyDays: string };
    };

export const WARRANTY_SETTINGS_DAYS_MESSAGE =
  "Escribí los días de garantía como un número entero de 0 a 3650.";

export const WARRANTY_SETTINGS_NOTICE = "Días de garantía guardados.";
