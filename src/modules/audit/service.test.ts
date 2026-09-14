import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InvalidAuditEntryError,
  validateAuditEntry,
  type AuditEntry,
} from "./service";

// Validación de la entrada de auditoría, sin base (brief-3.6, D-4).

function entry(overrides: Record<string, unknown> = {}): AuditEntry {
  return {
    organizationId: randomUUID(),
    actorUserId: randomUUID(),
    entityType: "organization_member",
    entityId: randomUUID(),
    action: "role_change",
    diff: { before: { role: "admin" }, after: { role: "viewer" } },
    ...overrides,
  } as AuditEntry;
}

function rejects(value: unknown) {
  expect(() => validateAuditEntry(value)).toThrow(InvalidAuditEntryError);
}

describe("validateAuditEntry", () => {
  it("acepta un cambio de rol y una creación", () => {
    const roleChange = entry();
    expect(validateAuditEntry(roleChange)).toEqual(roleChange);
    const creation = entry({
      action: "create",
      diff: { before: null, after: { role: "viewer" } },
    });
    expect(validateAuditEntry(creation)).toEqual(creation);
  });

  it("rechaza tipo de entidad o acción fuera de los enums", () => {
    rejects(entry({ entityType: "user" }));
    rejects(entry({ action: "delete" }));
  });

  it("rechaza ids que no son uuid", () => {
    rejects(entry({ entityId: "123" }));
    rejects(entry({ organizationId: "" }));
    rejects(entry({ actorUserId: undefined }));
  });

  it("una creación lleva before en null y after con campos", () => {
    rejects(
      entry({
        action: "create",
        diff: { before: { role: "admin" }, after: { role: "viewer" } },
      }),
    );
    rejects(entry({ action: "create", diff: { before: null, after: {} } }));
    rejects(entry({ action: "create", diff: { before: null, after: null } }));
  });

  it("fuera de create exige before y after con los mismos campos y algún cambio", () => {
    rejects(entry({ diff: { before: null, after: { role: "viewer" } } }));
    rejects(entry({ diff: { before: {}, after: {} } }));
    rejects(
      entry({ diff: { before: { role: "admin" }, after: { name: "Ana" } } }),
    );
    rejects(
      entry({
        action: "update",
        diff: { before: { role: "admin" }, after: { role: "admin" } },
      }),
    );
  });

  it("rechaza claves prohibidas sin importar mayúsculas", () => {
    for (const key of ["passwordHash", "session_token", "API_SECRET", "hash"]) {
      rejects(
        entry({
          action: "update",
          diff: { before: { [key]: "a" }, after: { [key]: "b" } },
        }),
      );
    }
  });

  it("rechaza valores que no son primitivos JSON y propiedades extra", () => {
    rejects(
      entry({ diff: { before: { role: "admin" }, after: { role: ["x"] } } }),
    );
    rejects(
      entry({ diff: { before: { role: "admin" }, after: { role: { a: 1 } } } }),
    );
    rejects({ ...entry(), extra: true });
    rejects(entry({ diff: { before: null, after: null, note: "x" } }));
  });

  it("el error nombra campos pero no incluye valores", () => {
    try {
      validateAuditEntry(
        entry({
          action: "update",
          diff: {
            before: { password: "valor-secreto-viejo" },
            after: { password: "valor-secreto-nuevo" },
          },
        }),
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAuditEntryError);
      expect((error as Error).message).toContain("diff");
      expect((error as Error).message).not.toContain("valor-secreto");
    }
  });
});
