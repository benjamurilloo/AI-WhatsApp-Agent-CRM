import { existsSync } from "node:fs";
import {
  applyAttributeTemplate,
  createServiceProduct,
} from "@/modules/catalog";
import { applyGradeTemplate } from "@/modules/inventory";
import {
  activateCapability,
  getProfile,
  PROFILES,
  type Capability,
} from "@/modules/organizations";
import { applyRepairTypeTemplate } from "@/modules/service";
import { applyChecklistTemplate } from "@/modules/tradeins";
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
//
// Desde la 29.5 (brief-29.5, D-5), serialized_units: con el perfil, si esta corrida la activa, copia
// también los grados del perfil, con la misma regla (saltea los que la organización ya tiene). Una
// organización que ya tenía variants activa la nueva con el mismo comando del perfil: variants queda
// como estaba y los atributos que ya tiene se saltean.
//
// Desde la 29.6 (brief-29.6, D-1), repairs: con el perfil, si esta corrida la activa, copia los tipos de
// reparación de ejemplo con la misma regla, y crea el producto de servicio de la organización, que no
// se crea desde la pantalla. Sin el perfil, también lo crea: sin él no hay venta de una reparación.
//
// Desde la 29.7 (brief-29.7, D-1 y D-3), trade_ins, que exige serialized_units activa: sin ella se
// rechaza y no se activa nada. Con el perfil, que activa las dos en orden, si esta corrida la activa,
// copia el checklist de un usado con la misma regla.

const usage =
  "Uso: npm run org:capability -- --organization <id> --admin-email <correo> (--profile <perfil> | --capability <capacidad>). Perfiles: " +
  PROFILES.map((profile) => profile.name).join(", ");

const CAPABILITIES: readonly Capability[] = [
  "variants",
  "serialized_units",
  "repairs",
  "trade_ins",
];

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
    const activatedNow = new Set<Capability>();
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
            : result.code === "BUSINESS_RULE_VIOLATION"
              ? `La capacidad ${capability} exige ${result.requires} activa. No se activó nada.`
              : "El correo no es de un admin activo de esa organización. No se activó nada.",
        );
      }
      actorUserId = result.actorUserId;
      if (result.status === "activated") {
        activated = true;
        activatedNow.add(capability);
      }
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
      if (activatedNow.has("serialized_units") && profile.grades.length > 0) {
        const grades = await applyGradeTemplate(tx, {
          organizationId,
          actorUserId,
          grades: profile.grades,
        });
        lines.push(
          `Perfil «${profile.label}»: grados creados: ${grades.created.join(", ") || "ninguno"}; ya existían: ${grades.skipped.join(", ") || "ninguno"}.`,
        );
      }
      if (activatedNow.has("repairs") && profile.repairTypes.length > 0) {
        const types = await applyRepairTypeTemplate(tx, {
          organizationId,
          actorUserId,
          repairTypes: profile.repairTypes,
        });
        lines.push(
          `Perfil «${profile.label}»: tipos de reparación creados: ${types.created.join(", ") || "ninguno"}; ya existían: ${types.skipped.join(", ") || "ninguno"}.`,
        );
      }
      if (
        activatedNow.has("trade_ins") &&
        profile.tradeInChecklist.length > 0
      ) {
        const items = await applyChecklistTemplate(tx, {
          organizationId,
          actorUserId,
          items: profile.tradeInChecklist,
        });
        lines.push(
          `Perfil «${profile.label}»: puntos del checklist de usados creados: ${items.created.join(", ") || "ninguno"}; ya existían: ${items.skipped.join(", ") || "ninguno"}.`,
        );
      }
    } else if (activatedNow.has("serialized_units")) {
      // Sin perfil no hay plantilla de grados: se dice, para que nadie la dé por copiada (revisión
      // independiente de la 29.5, m-6).
      lines.push(
        "Sin --profile no se copiaron grados, y una corrida posterior con --profile tampoco los copia: se crean desde la pantalla Grados.",
      );
    }
    // El producto de servicio, con o sin perfil, al activar repairs (D-1 y D-5): uno por organización.
    if (activatedNow.has("repairs")) {
      const service = await createServiceProduct(tx, {
        organizationId,
        actorUserId,
      });
      lines.push(
        service.status === "created"
          ? "Producto de servicio creado: Reparación."
          : "El producto de servicio ya existía.",
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
