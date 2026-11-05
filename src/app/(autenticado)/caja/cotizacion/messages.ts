import type {
  RecordExchangeRateResult,
  UpdateExchangeSettingsResult,
} from "@/modules/fx";
import { RATE_TEXT } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";

// Textos de la cotización (ADR 0025, punto 4; brief-29.4, D-4). *Desde la 24.7.3* (D-1 y D-2), la
// pantalla se llama «Tipo de cambio», que es como la nombran la navegación y las migas desde que
// existe, y la carga manual vive en un panel que abre y cierra por la URL.

export const RATE_TITLE = "Tipo de cambio";
export const CURRENT_RATE_TITLE = "Cotización actual";
export const SETTINGS_TITLE = "Configuración de la cotización";
export const HISTORY_TITLE = "Historial de cotizaciones";
export const LOAD_RATE_LINK = "Cargar cotización";
export const LOAD_RATE_PANEL_TITLE = "Cargar cotización manual";
export const CLOSE_PANEL_LABEL = "Cerrar la carga de cotización";
// El enlace del encabezado abre el panel y el botón del panel guarda: dos nombres distintos para
// dos cosas distintas, como la lámina.
// El nombre corto del estado viejo. La oración entera —`STALE_RATE_TEXT`, 78 caracteres— va
// debajo, en un recuadro que **envuelve**: adentro de la insignia, que es `whitespace-nowrap`,
// desbordaba la pantalla en 239 px a 320 (revisión independiente de la 24.7.3, B-1, medido).
export const STALE_BADGE_TEXT = "Desactualizada";
export const SAVE_RATE_BUTTON = "Guardar cotización";
export const BACK_LINK = "Volver";
// La lámina separa configurar **cómo se obtiene** la cotización de registrar **un valor**: el par
// es del sistema y acá se lee, no se elige (README del lote 23-tipo-cambio).
export const SYSTEM_CURRENCIES_TITLE = "Monedas del sistema";
export const SYSTEM_CURRENCIES_HELP =
  "No se puede modificar: define el par de cotización del sistema.";
export const RATE_BECOMES_CURRENT_TEXT =
  "Pasa a ser la vigente al guardar. Las operaciones anteriores conservan su cotización.";
export const RATE_FORBIDDEN_MESSAGE =
  "Tenés que cambiar tu contraseña antes de seguir.";
export const RATE_ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede cargar una cotización.";
export const NO_RATE_YET_MESSAGE =
  "Todavía no hay una cotización cargada. Sin ella, no se cobra en la otra moneda.";
export const MANUAL_SOURCE_TEXT = "Carga manual";
export const RATE_HELP =
  "La cotización que cargues pasa a ser la vigente: la usan los cobros en la otra moneda y los totales de referencia. Las anteriores quedan en el historial.";

export const RATE_NOTICE: Record<string, string> = {
  cargada: "Cotización cargada: es la vigente.",
  fuente:
    "Fuente y ajuste guardados. Se aplican en la próxima lectura automática.",
  automatica:
    "Fuente automática guardada: la próxima lectura reemplaza a la vigente, aunque DolarAPI no haya cambiado.",
  "sin-cambios": "La fuente y el ajuste ya eran esos: no cambió nada.",
};

// La fuente automática (ADR 0025, punto 4; brief-29.4.2, D-9). La atribución la piden las condiciones
// de uso de DolarAPI.
export const AUTOMATIC_SOURCE_TEXT =
  "DolarAPI, dólar blue, venta, más el ajuste";
// *Desde la 24.7.3*, el radio de la fuente lleva el nombre corto arriba y la explicación debajo,
// como la lámina. **Qué lee DolarAPI —dólar blue, venta— no se pierde**: sigue en la fuente de la
// cotización vigente, que es donde se lee un dato, no donde se elige una opción.
export const AUTOMATIC_SOURCE_LABEL = "DolarAPI (dolarapi.com)";
export const AUTOMATIC_SOURCE_HELP =
  "Lectura automática, más el ajuste de la organización. Toma el dólar blue, venta.";
export const MANUAL_SOURCE_HELP = "Ingresás vos la cotización.";
export const SAVE_SETTINGS_BUTTON = "Guardar configuración";
export const ATTRIBUTION_TEXT =
  "Fuente: DolarApi (dolarapi.com) + ajuste de la organización.";
export const READING_SCHEDULE_TEXT =
  "Se lee a las 9, 12, 15, 18 y 21, hora de Argentina.";
export const AUTOMATIC_OVERWRITES_MANUAL_TEXT =
  "Con la fuente automática, la próxima lectura que cambie de valor reemplaza a esta carga. Para que no la reemplace, pasá la fuente a «Carga manual».";
export const SETTINGS_HELP =
  "El ajuste se suma al valor de DolarAPI, en la otra moneda, y puede ser cero o negativo. Un cambio se aplica en la próxima lectura, no ahora.";
export const BACK_TO_AUTOMATIC_TEXT =
  "Si volvés a la fuente automática, la próxima lectura reemplaza a la vigente aunque DolarAPI no haya cambiado.";

export function sourceText(source: string): string {
  return source === "manual" ? MANUAL_SOURCE_TEXT : AUTOMATIC_SOURCE_TEXT;
}

export type SettingsFormValues = { source: string; adjustment: string };

export type SettingsFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: SettingsFormValues;
      message: string;
      field: "source" | "adjustment" | null;
    };

export function unexpectedSettingsMessage(requestId: string): string {
  return `No pudimos guardar la fuente y el ajuste. Código: ${requestId}`;
}

const ADJUSTMENT_TEXT: Record<string, string> = {
  invalid: "escribí un número, con coma decimal y un signo menos si resta.",
  decimals: "a lo sumo dos decimales.",
  too_large: "es demasiado grande.",
};

export function settingsRejection(
  result: Exclude<UpdateExchangeSettingsResult, { ok: true }>,
): { message: string; field: "source" | "adjustment" | null } {
  switch (result.code) {
    case "FORBIDDEN":
      return {
        message: "Solo un administrador puede cambiar la fuente y el ajuste.",
        field: null,
      };
    case "NOT_FOUND":
      return {
        message: "Esta organización no tiene moneda principal.",
        field: null,
      };
    case "VALIDATION_ERROR":
      return result.field === "source"
        ? { message: "Elegí una fuente.", field: "source" }
        : {
            message: `Ajuste: ${ADJUSTMENT_TEXT[result.reason] ?? ADJUSTMENT_TEXT.invalid}`,
            field: "adjustment",
          };
    case "BUSINESS_RULE_VIOLATION":
      return {
        message:
          "La fuente automática da pesos por dólar: solo está disponible con USD como moneda principal y ARS como la otra.",
        field: "source",
      };
  }
}

export type RateFormValues = { rate: string };

export type RateFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: RateFormValues;
      message: string;
      field: "rate" | null;
    }
  // Se mueve más de un 10 % contra la vigente: se pide confirmarla (D-4), sin bloquear.
  | {
      status: "confirm";
      requestId: string;
      values: RateFormValues;
      current: string;
    };

export function unexpectedRateMessage(requestId: string): string {
  return `No pudimos cargar la cotización. Código: ${requestId}`;
}

export function largeChangeMessage(current: string, next: string): string {
  return `La cotización nueva (${next}) se mueve más de un 10 % contra la vigente (${current}). Revisala y confirmala si es correcta.`;
}

export function rateRejection(
  result: Exclude<RecordExchangeRateResult, { ok: true }>,
): { message: string; field: "rate" | null } {
  switch (result.code) {
    case "FORBIDDEN":
      return { message: RATE_ADMIN_ONLY_MESSAGE, field: null };
    case "NOT_FOUND":
      return {
        message: "Esta organización no tiene moneda principal.",
        field: null,
      };
    case "VALIDATION_ERROR":
      return {
        message: `Cotización: ${RATE_TEXT[result.reason] ?? RATE_TEXT.invalid}`,
        field: "rate",
      };
    // La acción pide la confirmación antes de llegar acá.
    case "BUSINESS_RULE_VIOLATION":
      return {
        message: `Se mueve más de un 10 % contra la vigente (${result.current}).`,
        field: "rate",
      };
  }
}
