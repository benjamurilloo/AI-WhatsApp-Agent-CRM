import type { Failure } from "@/shared/errors";
import * as repository from "./repository";

// Límite de tasa por credencial (brief-6.5.3, D-3): ventana fija de un minuto en PostgreSQL. En el
// borde entre dos ventanas pueden pasar hasta el doble de requests (limitación aceptada).

export const INGESTION_RATE_LIMIT = 120;
export const INGESTION_RATE_WINDOW_MS = 60_000;

export type ConsumeIngestionRateResult =
  { ok: true } | Failure<"RATE_LIMITED", { retryAfterSeconds: number }>;

export function rateWindowStart(now: Date): Date {
  return new Date(
    Math.floor(now.getTime() / INGESTION_RATE_WINDOW_MS) *
      INGESTION_RATE_WINDOW_MS,
  );
}

// Segundos hasta la ventana siguiente, redondeados hacia arriba y nunca menos de uno.
export function retryAfterSeconds(now: Date): number {
  const next = rateWindowStart(now).getTime() + INGESTION_RATE_WINDOW_MS;
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export async function consumeIngestionRate(
  credentialId: string,
  now: Date = new Date(),
): Promise<ConsumeIngestionRateResult> {
  const count = await repository.incrementRateWindow(
    credentialId,
    rateWindowStart(now),
  );
  if (count <= INGESTION_RATE_LIMIT) return { ok: true };
  return {
    ok: false,
    code: "RATE_LIMITED",
    retryAfterSeconds: retryAfterSeconds(now),
  };
}
