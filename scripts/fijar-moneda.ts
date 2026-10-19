import { existsSync } from "node:fs";
import { createExchangeSettings } from "@/modules/fx";
import { setMainCurrency } from "@/modules/organizations";
import { getDb } from "@/shared/db";

// Fija la moneda principal de una organización y crea la configuración de su cotización (ADR 0025,
// punto 2; brief-29.4, D-2). Es la única forma de fijarla: no hay pantalla, y el admin del negocio no
// la cambia.
//   npm run org:currency -- --organization <id> --admin-email <correo> --main USD --quote ARS
// El autor es un admin activo de la organización, nombrado por su correo (ADR 0024, R-20). Todo
// ocurre en una transacción: si la configuración falla, la moneda principal no queda fijada.
// Fijarla por primera vez se permite aunque la organización tenga datos; cambiarla, no. Fijar la
// misma otra vez no hace nada. La primera cotización la carga un admin desde la pantalla (D-12).
//
// El correo también puede llegar por MONEDA_ADMIN_CORREO, para no dejarlo en el log de sudo ni a la
// vista de `ps`, como en org:create. El argumento, si viene, gana.

const usage =
  "Uso: npm run org:currency -- --organization <id> --admin-email <correo> --main <moneda> --quote <moneda>";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  const organizationId = option(args, "--organization");
  const adminEmail =
    option(args, "--admin-email") ?? process.env.MONEDA_ADMIN_CORREO;
  const main = option(args, "--main")?.trim().toUpperCase();
  const quote = option(args, "--quote")?.trim().toUpperCase();
  if (!organizationId || !adminEmail || !main || !quote) {
    throw new Error(usage);
  }

  const summary = await getDb().transaction(async (tx) => {
    const lines: string[] = [];
    const fixed = await setMainCurrency(tx, {
      organizationId,
      currency: main,
      adminEmail,
    });
    if (!fixed.ok) {
      throw new Error(
        fixed.code === "NOT_FOUND"
          ? "No existe esa organización. No se fijó nada."
          : fixed.code === "FORBIDDEN"
            ? "El correo no es de un admin activo de esa organización. No se fijó nada."
            : fixed.code === "VALIDATION_ERROR"
              ? `«${main}» no es una moneda aceptada. No se fijó nada.`
              : `La organización ya tiene ${"current" in fixed ? fixed.current : "otra"} como moneda principal, y no se cambia. No se fijó nada.`,
      );
    }
    lines.push(
      fixed.status === "set"
        ? `Moneda principal fijada: ${main}.`
        : `La moneda principal ya era ${main}.`,
    );
    const settings = await createExchangeSettings(tx, {
      organizationId,
      quoteCurrency: quote,
      actorUserId: fixed.actorUserId,
    });
    if (!settings.ok) {
      throw new Error(
        settings.code === "VALIDATION_ERROR"
          ? `«${quote}» no es una moneda aceptada distinta de ${main}. No se fijó nada.`
          : settings.code === "CONFLICT"
            ? `La cotización ya es contra ${settings.current}, y no se cambia. No se fijó nada.`
            : "La organización no tiene moneda principal. No se fijó nada.",
      );
    }
    lines.push(
      settings.status === "created"
        ? `Cotización configurada: 1 ${main} = ${quote}, carga manual. La primera la carga un admin en Caja → Cotización.`
        : `La cotización ya estaba configurada contra ${quote}.`,
    );
    return lines;
  });
  for (const line of summary) console.log(line);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) await getDb().$client.end();
  });
