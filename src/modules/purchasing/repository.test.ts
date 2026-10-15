import { describe, expect, it } from "vitest";
import { uniqueRuleOf } from "./repository";

// El rescate del 23505 por el nombre de la restricción (brief-22.2, D-6 y AC-5): solo las dos
// restricciones de D-2 y D-4 son una regla de negocio; cualquier otro error se relanza.

// drizzle-orm envuelve el error de pg y lo deja en la causa; a veces llega sin envolver.
const wrapped = (code: string, constraint: string) => ({
  message: "Failed query",
  cause: { code, constraint },
});

describe("uniqueRuleOf", () => {
  it("el nombre y el CUIT repetidos, envueltos o no", () => {
    expect(
      uniqueRuleOf(
        wrapped("23505", "suppliers_organization_name_lower_unique"),
      ),
    ).toBe("duplicate_name");
    expect(
      uniqueRuleOf({
        code: "23505",
        constraint: "suppliers_organization_cuit_unique",
      }),
    ).toBe("duplicate_cuit");
  });

  it("otro 23505, otro código o algo que no es un error de pg no son una regla", () => {
    expect(uniqueRuleOf(wrapped("23505", "suppliers_pkey"))).toBeNull();
    expect(
      uniqueRuleOf(wrapped("23505", "suppliers_organization_id_id_unique")),
    ).toBeNull();
    expect(
      uniqueRuleOf(
        wrapped("23514", "suppliers_organization_name_lower_unique"),
      ),
    ).toBeNull();
    expect(uniqueRuleOf(new Error("otra cosa"))).toBeNull();
    expect(uniqueRuleOf(null)).toBeNull();
  });
});
