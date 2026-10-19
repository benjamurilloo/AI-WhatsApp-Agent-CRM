"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordExchangeRate, updateExchangeSettings } from "@/modules/fx";
import { requireSession } from "@/app/_auth/session";
import { logEvent, newRequestId } from "@/shared/log";
import {
  rateRejection,
  settingsRejection,
  unexpectedRateMessage,
  unexpectedSettingsMessage,
  type RateFormState,
  type RateFormValues,
  type SettingsFormState,
  type SettingsFormValues,
} from "./messages";

// Server Action de la carga manual de una cotización (ADR 0025, punto 4; brief-29.4, D-4). La sesión
// se verifica acá; el rol, la organización y la moneda principal, en fx. El log lleva actor,
// organización, código y duración, nunca la cotización.

type LogCode = Parameters<typeof logEvent>[0]["code"];

export async function recordExchangeRateAction(
  _previous: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const context = await requireSession();
  const requestId = newRequestId();
  const started = performance.now();
  const log = (code: LogCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route: "caja.cotizacion",
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  const values: RateFormValues = {
    rate: String(formData.get("rate") ?? "")
      .trim()
      .slice(0, 40),
  };
  const confirmLargeChange = formData.get("confirmLargeChange") === "si";

  try {
    const result = await recordExchangeRate(context, {
      rate: values.rate,
      confirmLargeChange,
    });
    if (!result.ok) {
      log(result.code);
      if (result.code === "BUSINESS_RULE_VIOLATION") {
        return {
          status: "confirm",
          requestId,
          values,
          current: result.current,
        };
      }
      return { status: "error", requestId, values, ...rateRejection(result) };
    }
    log("OK");
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: unexpectedRateMessage(requestId),
      field: null,
    };
  }
  revalidatePath("/caja/cotizacion");
  revalidatePath("/caja");
  redirect("/caja/cotizacion?aviso=cargada");
}

// Server Action de la fuente y el ajuste (ADR 0025, punto 4; brief-29.4.2, D-9). Como la carga: la
// sesión acá, el rol y la organización en fx, y el log sin el ajuste.
export async function updateExchangeSettingsAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const context = await requireSession();
  const requestId = newRequestId();
  const started = performance.now();
  const log = (code: LogCode, error?: unknown) =>
    logEvent({
      level: code === "OK" ? "info" : error ? "error" : "warn",
      requestId,
      route: "caja.cotizacion.fuente",
      code,
      userId: context.userId,
      organizationId: context.organizationId,
      durationMs: performance.now() - started,
      error,
    });
  const values: SettingsFormValues = {
    source: String(formData.get("source") ?? "").slice(0, 40),
    adjustment: String(formData.get("adjustment") ?? "")
      .trim()
      .slice(0, 40),
  };

  let notice: string;
  try {
    const result = await updateExchangeSettings(context, values);
    if (!result.ok) {
      log(result.code);
      return {
        status: "error",
        requestId,
        values,
        ...settingsRejection(result),
      };
    }
    log("OK");
    notice = result.toAutomatic
      ? "automatica"
      : result.changed
        ? "fuente"
        : "sin-cambios";
  } catch (error) {
    log("INTERNAL", error);
    return {
      status: "error",
      requestId,
      values,
      message: unexpectedSettingsMessage(requestId),
      field: null,
    };
  }
  revalidatePath("/caja/cotizacion");
  redirect(`/caja/cotizacion?aviso=${notice}`);
}
