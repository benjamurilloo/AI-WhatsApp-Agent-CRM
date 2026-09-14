import { and, eq } from "drizzle-orm";
import { getDb } from "@/shared/db";
import { organizationMembers } from "./schema";

// Acceso a las tablas propias de organizations. Un recurso de una organización
// siempre se busca filtrando por organization_id en SQL (brief-3.4).

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

export async function findMember(organizationId: string, memberId: string) {
  const rows = await getDb()
    .select({
      id: organizationMembers.id,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      createdAt: organizationMembers.createdAt,
    })
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
