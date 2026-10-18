import { existsSync } from "node:fs";
import { applyAttributeTemplate } from "@/modules/catalog";
import {
  activateCapability,
  getProfile,
  PROFILES,
  type Capability,
} from "@/modules/organizations";
import { getDb } from "@/shared/db";

// Activa una capacidad en una organización y, con --profile, copia el perfil de rubro (ADR 0024,
// puntos 3 y 13; brief-29.2, D-2). Es la única forma de activar una capacidad: no hay pantalla.
//   npm run org:capability -- --organization <id> --admin-email <correo> --profile iphone
//   npm run org:capability -- --organization <id> --admin-email <correo> --capability variants
// El autor es un admin activo de la organización, nombrado por su correo (R-20). Todo ocurre en una
// transacción: si la copia del perfil falla, la capacidad no queda activada. Activarla otra vez no
// hace nada, y la copia saltea los atributos que la organización ya tiene. No hay desactivación.
//
// El correo también puede llegar por CAPACIDAD_ADMIN_CORREO, para no dejarlo en el log de sudo ni a
// la vista de `ps`, como en org:create. El argumento, si viene, gana.

const usage =
  "Uso: npm run org:capability -- --organization <id> --admin-email <correo> (--profile <perfil> | --capability <capacidad>). Perfiles: " +
  PROFILES.map((profile) => profile.name).join(", ");

const CAPABILITIES: readonly Capability[] = ["variants"];

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  const organizationId = option(args, "--organization");
  const adminEmail =
    option(args, "--admin-email") ?? process.env.CAPACIDAD_ADMIN_CORREO;
  const profileName = option(args, "--profile");
  const capabilityName = option(args, "--capability");
  if (
    !organizationId ||
    !adminEmail ||
    (profileName === undefined) === (capabilityName === undefined)
  ) {
    throw new Error(usage);
  }
  const profile =
    profileName === undefined ? undefined : getProfile(profileName);
  if (profileName !== undefined && !profile) {
    throw new Error(`No existe el perfil «${profileName}». ${usage}`);
  }
  const capabilities: Capability[] = profile
    ? profile.capabilities
    : CAPABILITIES.filter((capability) => capability === capabilityName);
  if (capabilities.length === 0) {
    throw new Error(`No existe la capacidad «${capabilityName}». ${usage}`);
  }

  const summary = await getDb().transaction(async (tx) => {
    const lines: string[] = [];
    let actorUserId = "";
    let activated = false;
    for (const capability of capabilities) {
      const result = await activateCapability(tx, {
        organizationId,
        capability,
        adminEmail,
      });
      if (!result.ok) {
        throw new Error(
          result.code === "NOT_FOUND"
            ? "No existe esa organización. No se activó nada."
            : "El correo no es de un admin activo de esa organización. No se activó nada.",
        );
      }
      actorUserId = result.actorUserId;
      if (result.status === "activated") activated = true;
      lines.push(
        result.status === "activated"
          ? `Capacidad activada: ${capability}.`
          : `La capacidad ${capability} ya estaba activa.`,
      );
    }
    // El perfil se copia solo al activar: sobre una capacidad ya activa no se hace nada, y una
    // plantilla nueva no toca a quien copió la anterior (ADR 0024, punto 13; brief-29.2, AC-4).
    if (profile && !activated) {
      lines.push(
        `El perfil «${profile.label}» no se copió: la capacidad ya estaba activa.`,
      );
    } else if (profile) {
      const copied = await applyAttributeTemplate(tx, {
        organizationId,
        actorUserId,
        attributes: profile.attributes,
      });
      lines.push(
        `Perfil «${profile.label}»: atributos creados: ${copied.created.join(", ") || "ninguno"}; ya existían: ${copied.skipped.join(", ") || "ninguno"}.`,
      );
    }
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
