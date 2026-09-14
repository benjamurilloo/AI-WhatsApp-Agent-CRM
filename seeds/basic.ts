import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/modules/auth";
import { users } from "@/modules/auth/schema";
import {
  organizationMembers,
  organizations,
} from "@/modules/organizations/schema";
import { createDb, type Db } from "@/shared/db";

// Seed básico sintético (brief-3.5, D-7): una organización, un admin, un viewer y un usuario
// con la contraseña pendiente de cambio. Idempotente: cada ejecución deja los mismos datos.

export const SEED_ORGANIZATION_ID = "5eed0000-0000-4000-8000-000000000001";

export const SEED_USERS = [
  {
    id: "5eed0000-0000-4000-8000-000000000011",
    email: "admin@example.com",
    name: "Admin de ejemplo",
    role: "admin",
    mustChangePassword: false,
  },
  {
    id: "5eed0000-0000-4000-8000-000000000012",
    email: "lectura@example.com",
    name: "Lectura de ejemplo",
    role: "viewer",
    mustChangePassword: false,
  },
  {
    id: "5eed0000-0000-4000-8000-000000000013",
    email: "nuevo@example.com",
    name: "Usuario nuevo de ejemplo",
    role: "viewer",
    mustChangePassword: true,
  },
] as const;

const seedableName = /_(dev|test|e2e)$/;

export function isSeedableDatabase(name: string): boolean {
  return seedableName.test(name);
}

export async function seedBasic(db: Db, password: string): Promise<void> {
  const current = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  const name = current.rows[0]?.name ?? "";
  if (!isSeedableDatabase(name)) {
    throw new Error(
      `El seed solo corre contra una base _dev, _test o _e2e, no contra "${name}".`,
    );
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `La contraseña del seed necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    );
  }

  const passwordHash = await hashPassword(password);
  const organizationName = "Organización de ejemplo";

  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: SEED_ORGANIZATION_ID, name: organizationName })
      .onConflictDoUpdate({
        target: organizations.id,
        set: { name: organizationName },
      });

    for (const user of SEED_USERS) {
      const values = {
        email: user.email,
        name: user.name,
        passwordHash,
        mustChangePassword: user.mustChangePassword,
        isActive: true,
      };
      await tx
        .insert(users)
        .values({ id: user.id, ...values })
        .onConflictDoUpdate({ target: users.id, set: values });
      await tx
        .insert(organizationMembers)
        .values({
          organizationId: SEED_ORGANIZATION_ID,
          userId: user.id,
          role: user.role,
        })
        .onConflictDoUpdate({
          target: organizationMembers.userId,
          set: { organizationId: SEED_ORGANIZATION_ID, role: user.role },
        });
    }
  });
}

async function main(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!url) throw new Error("Falta DATABASE_URL: copiá .env.example a .env.");
  if (!password) {
    throw new Error("Falta SEED_USER_PASSWORD: copiá .env.example a .env.");
  }

  const db = createDb(url);
  try {
    await seedBasic(db, password);
    console.log(
      `Seed básico aplicado: ${SEED_USERS.map((user) => user.email).join(", ")}.`,
    );
  } finally {
    await db.$client.end();
  }
}

// Solo corre al ejecutarse con npm run db:seed; importarlo desde los tests no escribe nada.
if (process.argv[1]?.replaceAll("\\", "/").endsWith("seeds/basic.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
