import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/shared/db";
import {
  phoneEncodings,
  phoneNeedle,
  verifyIdentifiers,
} from "../../scripts/verificar-identificadores";
import { resetDatabase } from "./reset-database";

// El instrumento de H-4 (brief-13.5, D-5): que los identificadores del emisor no lleven el
// teléfono de nadie. Los teléfonos son del rango ficticio del proyecto, y los identificadores con
// forma de wamid se arman acá: la forma pública de un wamid es base64 de una estructura binaria
// con los dígitos del teléfono en ASCII. No se usó ningún wamid real.

const PHONE = "+5491155550191";
const DIGITS = "5491155550191";
const NEEDLES = [phoneNeedle(PHONE)];

// Bytes con la forma de un wamid: un prefijo binario, los dígitos y un id de mensaje.
function wamidPayload(digits: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x18, digits.length]),
    Buffer.from(digits, "latin1"),
    Buffer.from([0x15, 0x02, 0x00, 0x12, 0x18, 0x16]),
    Buffer.from("3EB0C2F1A9D8E7F6A5B4C3", "latin1"),
    // Bytes que en base64 se escriben «++//»: distinguen el estándar del url-safe.
    Buffer.from([0xfb, 0xef, 0xff]),
  ]);
}
const WAMID = `wamid.${wamidPayload(DIGITS).toString("base64")}`;
const WAMID_URLSAFE = `wamid.${wamidPayload(DIGITS).toString("base64url")}`;
// Tres caracteres del mismo alfabeto delante corren la alineación del base64.
const WAMID_MISALIGNED = `wa-${wamidPayload(DIGITS).toString("base64")}`;
const REMOTE_JID = `${DIGITS}@s.whatsapp.net`;
const HEX_REF = `evt-${Buffer.from(DIGITS, "latin1").toString("hex")}`;
// La «d» de «id» es hexadecimal: corre medio byte el tramo que lleva el teléfono.
const HEX_MISALIGNED = `id${Buffer.from(DIGITS, "latin1").toString("hex")}`;
// Un wamid entero codificado otra vez, en lugar de pasado por un hash con clave.
const NESTED_BASE64 = `evt-${Buffer.from(WAMID, "latin1").toString("base64url")}`;
const NESTED_HEX = `evt-${Buffer.from(WAMID, "latin1").toString("hex")}`;
// El mismo número sin el 9 de los móviles: los últimos 8 dígitos lo alcanzan igual.
const WITHOUT_NINE = "541155550191@s.whatsapp.net";

// Lo que la guía de ingestion-v2 pide: un hash con clave propia del emisor.
const KEY = "clave-del-emisor-de-prueba";
const CLEAN = [
  createHmac("sha256", KEY).update(WAMID).digest("hex"),
  createHmac("sha256", KEY).update(WAMID).digest("base64url"),
  `evt-${createHash("sha256").update("conversation.resolved").digest("hex").slice(0, 32)}`,
  "wa-msg-wamid-fict-t3-1",
  "conv-propuesta-0001",
  "3f2b8c1e-4d5a-4e6b-9c7d-8e9f0a1b2c3d",
];

let organizationId: string;

async function insertOrganization(name: string): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function insertClient(orgId: string, phone: string | null) {
  await getDb().execute(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${orgId}, 'Cliente de prueba', ${phone})`,
  );
}

async function insertEvent(orgId: string, ref: string) {
  await getDb().execute(
    sql`insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash)
        values (${orgId}, 'agente-prueba', ${ref}, 'conversation.resolved', ${randomUUID()})`,
  );
}

async function insertConversation(
  orgId: string,
  conversationRef: string,
  messageRef: string,
) {
  const conversation = await getDb().execute<{ id: string }>(
    sql`insert into conversations (organization_id, channel, status, started_at, external_ref)
        values (${orgId}, 'whatsapp', 'open', '2026-10-01T12:00:00Z', ${conversationRef})
        returning id`,
  );
  await getDb().execute(
    sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text, external_ref)
        values (${orgId}, ${conversation.rows[0]!.id}, 'inbound', '2026-10-01T12:00:00Z', 'Hola', ${messageRef})`,
  );
}

beforeEach(async () => {
  await resetDatabase(getDb());
  organizationId = await insertOrganization("Negocio de prueba");
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("en qué forma aparece un teléfono en un identificador", () => {
  it("1. busca los últimos 8 dígitos", () => {
    expect(phoneNeedle(PHONE)).toBe("55550191");
  });

  it("2. en claro, como en un remoteJid", () => {
    expect([...phoneEncodings(REMOTE_JID, NEEDLES)]).toEqual(["plain"]);
  });

  it("3. en base64, como en un wamid, sin aparecer en claro", () => {
    expect(WAMID).not.toContain(DIGITS.slice(-8));
    expect([...phoneEncodings(WAMID, NEEDLES)]).toEqual(["base64"]);
  });

  it("4. en base64 url-safe", () => {
    expect(WAMID).toMatch(/[+/]/);
    expect(WAMID_URLSAFE).toMatch(/[-_]/);
    expect([...phoneEncodings(WAMID_URLSAFE, NEEDLES)]).toEqual(["base64"]);
  });

  it("5. en base64 corrido por un prefijo del mismo alfabeto", () => {
    expect([...phoneEncodings(WAMID_MISALIGNED, NEEDLES)]).toEqual(["base64"]);
  });

  it("6. en hexadecimal", () => {
    expect([...phoneEncodings(HEX_REF, NEEDLES)]).toEqual(["hex"]);
  });

  it("7. sin el 9 de los móviles", () => {
    expect([...phoneEncodings(WITHOUT_NINE, NEEDLES)]).toEqual(["plain"]);
  });

  it("8. ningún falso positivo con identificadores sin teléfono", () => {
    for (const ref of CLEAN) {
      expect([...phoneEncodings(ref, NEEDLES)], ref).toEqual([]);
    }
  });

  // Revisión independiente de la 13.5.1, H-3 y H-4.
  it("17. en hexadecimal corrido medio byte", () => {
    expect([...phoneEncodings(HEX_MISALIGNED, NEEDLES)]).toEqual(["hex"]);
  });

  it("18. un wamid entero en base64, otra vez", () => {
    expect(NESTED_BASE64).not.toContain("wamid");
    expect([...phoneEncodings(NESTED_BASE64, NEEDLES)]).toEqual(["base64"]);
  });

  it("19. un wamid entero en hexadecimal", () => {
    expect([...phoneEncodings(NESTED_HEX, NEEDLES)]).toEqual(["hex"]);
  });
});

describe("verifyIdentifiers contra la base", () => {
  it("9. cuenta por tabla y por forma, solo en la organización pedida", async () => {
    await insertClient(organizationId, PHONE);
    await insertEvent(organizationId, WAMID);
    await insertEvent(organizationId, CLEAN[0]!);
    await insertConversation(organizationId, REMOTE_JID, HEX_REF);
    // Otra organización con los mismos identificadores: no cuenta.
    const other = await insertOrganization("Otro negocio");
    await insertClient(other, PHONE);
    await insertEvent(other, WAMID_URLSAFE);
    await insertConversation(other, WAMID, WAMID);

    expect(await verifyIdentifiers(getDb(), organizationId)).toEqual({
      phones: 1,
      clean: false,
      tables: [
        { table: "ingestion_events", checked: 2, plain: 0, base64: 1, hex: 0 },
        { table: "conversations", checked: 1, plain: 1, base64: 0, hex: 0 },
        { table: "messages", checked: 1, plain: 0, base64: 0, hex: 1 },
      ],
    });
  });

  it("10. una organización con identificadores limpios da limpio", async () => {
    await insertClient(organizationId, PHONE);
    for (const ref of CLEAN) await insertEvent(organizationId, ref);
    await insertConversation(organizationId, CLEAN[3]!, CLEAN[4]!);

    const report = await verifyIdentifiers(getDb(), organizationId);
    expect(report.clean).toBe(true);
    expect(report.tables[0]!.checked).toBe(CLEAN.length);
  });

  it("11. un teléfono que no es de un cliente se busca si se lo pasa aparte", async () => {
    await insertEvent(organizationId, WAMID);

    expect((await verifyIdentifiers(getDb(), organizationId)).phones).toBe(0);
    const report = await verifyIdentifiers(getDb(), organizationId, [PHONE]);
    expect(report).toMatchObject({ phones: 1, clean: false });
    expect(report.tables[0]).toMatchObject({ base64: 1 });
  });

  it("12. ignora los identificadores vaciados por la 13.4", async () => {
    await insertClient(organizationId, PHONE);
    await insertConversation(organizationId, CLEAN[3]!, CLEAN[4]!);
    await getDb().execute(
      sql`update messages set body_text = null, external_ref = null
          where organization_id = ${organizationId}`,
    );

    const report = await verifyIdentifiers(getDb(), organizationId);
    expect(report.tables[2]).toMatchObject({ checked: 0 });
  });
});

describe("el script, como lo corre el operador", () => {
  function run(env: Record<string, string> = {}) {
    const result = spawnSync(
      "npx",
      ["tsx", "scripts/verificar-identificadores.ts", "--org", organizationId],
      {
        encoding: "utf8",
        shell: true,
        env: { ...process.env, ...env },
      },
    );
    return { status: result.status, output: result.stdout + result.stderr };
  }

  it(
    "13. sale con 1 si hay un teléfono, y no imprime ningún identificador ni teléfono",
    { timeout: 60000 },
    async () => {
      await insertClient(organizationId, PHONE);
      await insertEvent(organizationId, WAMID);
      await insertConversation(organizationId, REMOTE_JID, HEX_REF);

      const { status, output } = run();
      expect(status).toBe(1);
      expect(output).toContain("HAY identificadores con un teléfono");
      for (const secret of [
        DIGITS.slice(-8),
        WAMID.slice(6, 20),
        REMOTE_JID,
        HEX_REF,
      ]) {
        expect(output).not.toContain(secret);
      }
    },
  );

  it("14. sale con 0 si está limpio", { timeout: 60000 }, async () => {
    await insertClient(organizationId, PHONE);
    await insertEvent(organizationId, CLEAN[0]!);

    const { status, output } = run();
    expect(status).toBe(0);
    expect(output).toContain("Ningún identificador lleva un teléfono buscado.");
  });

  it(
    "15. sale con 2 si no hay teléfonos que buscar",
    { timeout: 60000 },
    async () => {
      await insertEvent(organizationId, WAMID);

      const { status, output } = run();
      expect(status).toBe(2);
      expect(output).toContain("no prueba nada");
    },
  );

  it(
    "16. VERIFICAR_TELEFONO inválido se rechaza con 3, sin repetir el valor",
    { timeout: 60000 },
    async () => {
      const { status, output } = run({ VERIFICAR_TELEFONO: "11-5555-0191" });
      // 3 y no 1: un error no es un teléfono encontrado (revisión de la 13.5.1, H-7).
      expect(status).toBe(3);
      expect(output).toContain("no está en formato E.164");
      expect(output).not.toContain("5555-0191");
    },
  );

  it(
    "20. sale con 2 si la organización no tiene eventos de ingestión",
    { timeout: 60000 },
    async () => {
      // Un teléfono para buscar y nada donde buscarlo: el id equivocado, o el mensaje que no
      // llegó (revisión de la 13.5.1, H-1).
      await insertClient(organizationId, PHONE);

      const { status, output } = run({ VERIFICAR_TELEFONO: PHONE });
      expect(status).toBe(2);
      expect(output).toContain("no tiene eventos de ingestión");
      expect(output).not.toContain("Ningún identificador lleva");
    },
  );
});
