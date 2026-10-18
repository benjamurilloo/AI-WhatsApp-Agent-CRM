import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  capability,
  organizationCapabilities,
  organizationMembers,
  organizations,
} from "./schema";

// Acceso a las tablas propias de organizations. Un recurso de una organización
// siempre se busca filtrando por organization_id en SQL (brief-3.4).

type Executor = Db | DbTransaction;

export type MemberRow = {
  id: string;
  userId: string;
  role: "admin" | "viewer";
  createdAt: Date;
};

const memberColumns = {
  id: organizationMembers.id,
  userId: organizationMembers.userId,
  role: organizationMembers.role,
  createdAt: organizationMembers.createdAt,
};

export async function findMembershipByUserId(userId: string) {
  const rows = await getDb()
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  return rows[0];
}

export async function findMember(
  organizationId: string,
  memberId: string,
  executor: Executor = getDb(),
): Promise<MemberRow | undefined> {
  const rows = await executor
    .select(memberColumns)
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.id, memberId),
      ),
    )
    .limit(1);
  return rows[0];
}

// Todos los miembros de la organización; la lista se compone y pagina en memoria (brief-3.7, D-3).
export function findMembers(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<MemberRow[]> {
  return executor
    .select(memberColumns)
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));
}

export async function findOrganizationName(
  organizationId: string,
): Promise<string | undefined> {
  const rows = await getDb()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return rows[0]?.name;
}

export async function findOrganizationTimezone(
  organizationId: string,
): Promise<string | undefined> {
  const rows = await getDb()
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return rows[0]?.timezone;
}

// Toda escritura sobre miembros corre con la fila de la organización bloqueada: los cambios de
// una misma organización se serializan y la regla del último admin se evalúa sin carreras
// (brief-3.7, D-4). Bajo READ COMMITTED, cada consulta posterior al bloqueo ve lo confirmado.
export function withOrganizationLock<T>(
  organizationId: string,
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for("update");
    return work(tx);
  });
}

// Alta de una organización con su primer admin (brief-13.1, D-9): no hay fila que bloquear
// todavía, así que la atomicidad la da una transacción simple.
export function inTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

export async function insertOrganization(
  tx: DbTransaction,
  organization: { name: string; timezone: string },
): Promise<string> {
  const rows = await tx
    .insert(organizations)
    .values(organization)
    .returning({ id: organizations.id });
  return rows[0]!.id;
}

export async function insertMember(
  tx: DbTransaction,
  member: { organizationId: string; userId: string; role: "admin" | "viewer" },
): Promise<string> {
  const rows = await tx
    .insert(organizationMembers)
    .values(member)
    .returning({ id: organizationMembers.id });
  return rows[0]!.id;
}

export async function updateMemberRole(
  tx: DbTransaction,
  organizationId: string,
  memberId: string,
  role: "admin" | "viewer",
): Promise<void> {
  // A diferencia de las otras seis escrituras de H-7, acá el llamador NO lee la fila con
  // FOR UPDATE: `findMember` no lo usa. La serialización la da `withOrganizationLock`, que
  // bloquea la fila de la organización, así que todos los cambios de miembros de esa
  // organización se ordenan igual. Por eso cero filas actualizadas sigue siendo un defecto de
  // programación y no una carrera, y se lanza dentro de la transacción, que revierte
  // (9.0.1, D-1; la distinción la encontró la revisión independiente).
  const rows = await tx
    .update(organizationMembers)
    .set({ role })
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.id, memberId),
      ),
    )
    .returning({ id: organizationMembers.id });
  if (rows.length === 0) {
    throw new Error("updateMemberRole: la fila no existe en esta organización");
  }
}

// Ids de los usuarios que son miembros de esta organización, entre los pedidos.
// Es la intersección que convierte la lectura de usuarios en una lectura aislada:
// `auth` no puede filtrar por organización sin importar este módulo, lo que crearía
// un ciclo, así que el filtro vive acá, del lado que sí es dueño de la membresía
// (9.0.1, D-2; H-1 de la 8.4).
export async function findMemberUserIds(
  organizationId: string,
  userIds: string[],
  executor: Executor = getDb(),
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await executor
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        inArray(organizationMembers.userId, userIds),
      ),
    );
  return rows.map((row) => row.userId);
}

// Capacidades (ADR 0024, punto 3; brief-29.2, D-2). findCapabilities es la única lectura de
// organization_capabilities, y insertCapability la única escritura: las vigila
// tests/guards/capability-reads.test.ts.
export type CapabilityName = (typeof capability.enumValues)[number];

export async function findCapabilities(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<CapabilityName[]> {
  const rows = await executor
    .select({ capability: organizationCapabilities.capability })
    .from(organizationCapabilities)
    .where(eq(organizationCapabilities.organizationId, organizationId));
  return rows.map((row) => row.capability);
}

// ON CONFLICT DO NOTHING: activar una capacidad ya activa no escribe nada y devuelve undefined.
export async function insertCapability(
  tx: DbTransaction,
  row: {
    organizationId: string;
    capability: CapabilityName;
    activatedBy: string;
  },
): Promise<string | undefined> {
  const rows = await tx
    .insert(organizationCapabilities)
    .values(row)
    .onConflictDoNothing({
      target: [
        organizationCapabilities.organizationId,
        organizationCapabilities.capability,
      ],
    })
    .returning({ id: organizationCapabilities.id });
  return rows[0]?.id;
}

// La fila de la organización, bloqueada: el script de capacidades la usa para saber que existe y
// para serializar dos activaciones simultáneas.
export async function lockOrganization(
  tx: DbTransaction,
  organizationId: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for("update");
  return rows.length > 0;
}
