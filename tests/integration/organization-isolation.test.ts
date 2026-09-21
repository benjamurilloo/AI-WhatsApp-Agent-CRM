import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as catalogRepository from "@/modules/catalog/repository";
import * as conversationsRepository from "@/modules/conversations/repository";
import * as crmRepository from "@/modules/crm/repository";
import * as ingestionRepository from "@/modules/ingestion/repository";
import { getMemberSummaries } from "@/modules/organizations";
import * as organizationsRepository from "@/modules/organizations/repository";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Aislamiento por organización en el acceso a datos (9.0.1; H-7 y H-1 de la 8.4).
//
// Por qué estos tests llaman al repositorio y no a la interfaz pública: los siete casos de uso
// leen la fila filtrada por organización ANTES de escribir, así que por el servicio la operación
// devuelve NOT_FOUND y nunca llega a la escritura. Eso es justamente lo que hacía a H-7
// inalcanzable, y también lo que hace imposible probar el invariante del repositorio desde
// afuera. Para producir evidencia del filtro en el `where` hay que llamar al repositorio con una
// organización que no es la dueña de la fila. Es el único lugar del proyecto donde un test de
// integración importa un `repository` de un módulo, y es deliberado: la excepción está registrada
// en docs/architecture/RepositoryStructure.md §Frontera entre módulos.
//
// La 9.0.4 sumó `ingestion.finishEvent`, de la misma clase, con un motivo todavía más fuerte para
// no pasar por la interfaz pública: su id lo crea `reserveEvent` dentro de la transacción, así que
// desde afuera no hay forma de construir la llamada cruzada que este test necesita.
//
// Los datos se insertan por SQL: son fixtures sintéticos, declarados como tales (brief-6.4, D-5).

type Fixture = {
  orgA: string;
  orgB: string;
  productB: string;
  clientB: string;
  memberB: string;
  userB: string;
  conversationB: string;
  eventB: string;
};

let fixture: Fixture;

async function createOrganization(name: string): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function seed(): Promise<Fixture> {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");

  const product = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name, unit)
        values (${orgB}, 'SKU-B', 'Producto de B', 'unidad') returning id`,
  );
  const client = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgB}, 'Cliente de B', '+5491100000001') returning id`,
  );
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values ('miembro-b@example.com', 'hash-irrelevante', 'Miembro de B') returning id`,
  );
  const member = await getDb().execute<{ id: string }>(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${orgB}, ${user.rows[0]!.id}, 'viewer') returning id`,
  );
  const conversation = await getDb().execute<{ id: string }>(
    sql`insert into conversations (organization_id, channel, external_ref, started_at, last_message_at)
        values (${orgB}, 'whatsapp', 'ext-b-1', '2026-09-01T12:00:00Z', '2026-09-01T12:00:00Z')
        returning id`,
  );

  // La fila de ingestion_events se inserta por SQL y no con `reserveEvent` (9.0.4, D-3): lo que
  // este test prueba es el `where` de la escritura, y montar el contexto de ingestión completo no
  // agregaría evidencia sobre eso.
  const event = await getDb().execute<{ id: string }>(
    sql`insert into ingestion_events
          (organization_id, source, external_ref, event_type, payload_hash)
        values (${orgB}, 'fuente-b', 'evt-b-1', 'message.received', 'hash-irrelevante')
        returning id`,
  );

  return {
    orgA,
    orgB,
    eventB: event.rows[0]!.id,
    productB: product.rows[0]!.id,
    clientB: client.rows[0]!.id,
    memberB: member.rows[0]!.id,
    userB: user.rows[0]!.id,
    conversationB: conversation.rows[0]!.id,
  };
}

beforeEach(async () => {
  await resetDatabase(getDb());
  fixture = await seed();
});

afterAll(async () => {
  await getDb().$client.end();
});

// La transacción se deja CONFIRMAR. Es deliberado y es lo que hace que la aserción sobre el
// estado de la base signifique algo: si el filtro por organización no estuviera, la escritura
// no lanzaría, la transacción commitearía y la fila de la otra organización quedaría cambiada,
// que es exactamente el defecto. Con el filtro, la función lanza y la transacción revierte sola.
//
// Una versión anterior de este ayudante forzaba el rollback siempre. Así los `select` posteriores
// devolvían el valor original con y sin la corrección, y la única aserción que discriminaba era
// la del mensaje de error. Lo encontró la revisión independiente de la 9.0.1.
async function attempt(
  work: (tx: never) => Promise<unknown>,
): Promise<unknown> {
  try {
    await getDb().transaction(async (tx) => {
      await work(tx as never);
    });
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("las siete escrituras de H-7 no alcanzan a otra organización", () => {
  it("updateProductValues", async () => {
    const error = await attempt((tx) =>
      catalogRepository.updateProductValues(
        tx,
        fixture.orgA,
        fixture.productB,
        {
          name: "Renombrado por A",
        },
      ),
    );
    const after = await getDb().execute<{ name: string }>(
      sql`select name from products where id = ${fixture.productB}`,
    );
    expect(after.rows[0]!.name).toBe("Producto de B");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateProductActive", async () => {
    const error = await attempt((tx) =>
      catalogRepository.updateProductActive(
        tx,
        fixture.orgA,
        fixture.productB,
        false,
      ),
    );
    const after = await getDb().execute<{ is_active: boolean }>(
      sql`select is_active from products where id = ${fixture.productB}`,
    );
    expect(after.rows[0]!.is_active).toBe(true);
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateClientValues", async () => {
    const error = await attempt((tx) =>
      crmRepository.updateClientValues(tx, fixture.orgA, fixture.clientB, {
        displayName: "Renombrado por A",
      }),
    );
    const after = await getDb().execute<{ display_name: string }>(
      sql`select display_name from clients where id = ${fixture.clientB}`,
    );
    expect(after.rows[0]!.display_name).toBe("Cliente de B");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateClientActive", async () => {
    const error = await attempt((tx) =>
      crmRepository.updateClientActive(
        tx,
        fixture.orgA,
        fixture.clientB,
        false,
      ),
    );
    const after = await getDb().execute<{ is_active: boolean }>(
      sql`select is_active from clients where id = ${fixture.clientB}`,
    );
    expect(after.rows[0]!.is_active).toBe(true);
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateMemberRole", async () => {
    const error = await attempt((tx) =>
      organizationsRepository.updateMemberRole(
        tx,
        fixture.orgA,
        fixture.memberB,
        "admin",
      ),
    );
    const after = await getDb().execute<{ role: string }>(
      sql`select role from organization_members where id = ${fixture.memberB}`,
    );
    expect(after.rows[0]!.role).toBe("viewer");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("updateConversationStatus", async () => {
    const error = await attempt((tx) =>
      conversationsRepository.updateConversationStatus(
        tx,
        fixture.orgA,
        fixture.conversationB,
        "closed",
      ),
    );
    const after = await getDb().execute<{ status: string }>(
      sql`select status from conversations where id = ${fixture.conversationB}`,
    );
    expect(after.rows[0]!.status).toBe("open");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });

  it("widenConversationDates", async () => {
    const error = await attempt((tx) =>
      conversationsRepository.widenConversationDates(
        tx,
        fixture.orgA,
        fixture.conversationB,
        new Date("2020-01-01T00:00:00Z"),
      ),
    );
    const after = await getDb().execute<{ started_at: string }>(
      sql`select started_at from conversations where id = ${fixture.conversationB}`,
    );
    // Sin el filtro, least() habría movido started_at a 2020 y la transacción lo habría
    // confirmado, porque nada lanzaría.
    expect(after.rows[0]!.started_at).toContain("2026-09-01");
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });
});

describe("la escritura de ingestion de la 9.0.4 no alcanza a otra organización", () => {
  it("finishEvent", async () => {
    const error = await attempt((tx) =>
      ingestionRepository.finishEvent(tx, fixture.orgA, fixture.eventB, {
        status: "failed",
        errorCode: "CONFLICT",
      }),
    );
    const after = await getDb().execute<{
      status: string;
      error_code: string | null;
      processed_at: string | null;
    }>(
      sql`select status, error_code, processed_at
          from ingestion_events where id = ${fixture.eventB}`,
    );
    // Sin el filtro, el evento de B quedaría en 'failed' con su error_code y su processed_at
    // escritos por A, y la transacción lo confirmaría porque nada lanzaría.
    expect(after.rows[0]!.status).toBe("received");
    expect(after.rows[0]!.error_code).toBeNull();
    expect(after.rows[0]!.processed_at).toBeNull();
    expect((error as Error | undefined)?.message).toContain(
      "no existe en esta organización",
    );
  });
});

describe("la lectura de usuarios de H-1 no cruza organizaciones", () => {
  it("getMemberSummaries no devuelve un usuario de otra organización", async () => {
    const summaries = await getMemberSummaries(fixture.orgA, [fixture.userB]);
    expect(summaries).toEqual([]);
  });

  it("getMemberSummaries sí devuelve al usuario de su propia organización", async () => {
    const summaries = await getMemberSummaries(fixture.orgB, [fixture.userB]);
    expect(summaries.map((user) => user.id)).toEqual([fixture.userB]);
  });
});
