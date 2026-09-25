import { describe, expect, it } from "vitest";
import { auditActorLabel } from "./actor";

// Autor de la auditoría en pantalla (brief-12.1, D-4).

const CREDENTIAL_ID = "5eed0000-0000-4000-8000-00000000c001";

describe("auditActorLabel", () => {
  it("FR-AUD-03: un usuario se muestra con su nombre", () => {
    expect(
      auditActorLabel({ kind: "user", id: "u", name: "Ana Admin" }, new Map()),
    ).toBe("Ana Admin");
  });

  it("FR-AUD-03: una credencial de servicio se muestra con su emisor", () => {
    expect(
      auditActorLabel(
        { kind: "service", credentialId: CREDENTIAL_ID },
        new Map([[CREDENTIAL_ID, "emisor-prueba"]]),
      ),
    ).toBe("Servicio · emisor-prueba");
  });

  it("FR-AUD-03: sin emisor conocido dice Servicio, nunca queda vacío", () => {
    expect(
      auditActorLabel(
        { kind: "service", credentialId: CREDENTIAL_ID },
        new Map(),
      ),
    ).toBe("Servicio");
  });
});
