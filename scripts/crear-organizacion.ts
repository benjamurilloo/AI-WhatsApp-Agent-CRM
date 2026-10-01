import { existsSync } from "node:fs";
import { createOrganizationWithAdmin } from "@/modules/organizations";
import { getDb } from "@/shared/db";

// Crea una organización con su primer admin (brief-13.1, D-9). Es la única forma de dar de alta
// una organización fuera de un seed, y los seeds no corren contra una base productiva:
//   npm run org:create -- --name "<organización>" --admin-name "<nombre>" --admin-email <correo> [--timezone <IANA>]
// El admin entra con una contraseña inicial que el sistema le obliga a cambiar. Se imprime una sola
// vez en esta terminal y no se guarda en ningún lado. La base es la de DATABASE_URL.
//
// Cada valor también puede llegar por el entorno: CREAR_ORG_NOMBRE, CREAR_ORG_ADMIN_NOMBRE y
// CREAR_ORG_ADMIN_CORREO. Es la forma para el alta de un negocio: el nombre y el correo del admin
// son de un tercero, y como argumentos de sudo quedan en su log y a la vista de `ps` (revisión
// independiente de la 13.5.1, H-5). El argumento, si viene, gana.

const usage =
  'Uso: npm run org:create -- --name "<organización>" --admin-name "<nombre>" --admin-email <correo> [--timezone <IANA>], o los tres valores en CREAR_ORG_NOMBRE, CREAR_ORG_ADMIN_NOMBRE y CREAR_ORG_ADMIN_CORREO';

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const args = process.argv.slice(2);
  const organizationName =
    option(args, "--name") ?? process.env.CREAR_ORG_NOMBRE;
  const adminName =
    option(args, "--admin-name") ?? process.env.CREAR_ORG_ADMIN_NOMBRE;
  const adminEmail =
    option(args, "--admin-email") ?? process.env.CREAR_ORG_ADMIN_CORREO;
  const timezone = option(args, "--timezone");
  if (
    organizationName === undefined ||
    adminName === undefined ||
    adminEmail === undefined
  ) {
    throw new Error(usage);
  }

  const result = await createOrganizationWithAdmin({
    organizationName,
    adminName,
    adminEmail,
    timezone,
  });
  if (!result.ok) {
    throw new Error(
      result.code === "CONFLICT"
        ? "Ya existe un usuario con ese correo. No se creó nada."
        : `Datos inválidos: ${result.fields.join(", ")}. No se creó nada.`,
    );
  }
  console.log(`Organización creada: ${result.organizationId}`);
  console.log(`Admin creado: ${result.userId}`);
  console.log(
    `Contraseña inicial (se muestra una sola vez; se cambia al primer ingreso): ${result.initialPassword}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) await getDb().$client.end();
  });
