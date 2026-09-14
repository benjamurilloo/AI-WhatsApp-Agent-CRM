import { and, eq } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { organizationMembers, organizations } from "./schema";

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
  memberId: string,
  role: "admin" | "viewer",
): Promise<void> {
  await tx
    .update(organizationMembers)
    .set({ role })
    .where(eq(organizationMembers.id, memberId));
}
