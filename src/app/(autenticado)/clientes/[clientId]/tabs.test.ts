import { describe, expect, it } from "vitest";
import { clientTabHref, parseClientTab } from "./tabs";

const CLIENT_ID = "0b6f1a52-3c4d-4e5f-8a9b-0c1d2e3f4a5b";

describe("pestañas de la ficha del cliente (brief-24.4.1, D-1)", () => {
  it("lee la pestaña de la URL y vuelve a Resumen con un valor desconocido", () => {
    expect(parseClientTab(undefined)).toBe("resumen");
    expect(parseClientTab("cuenta")).toBe("cuenta");
    expect(parseClientTab("actividad")).toBe("actividad");
    expect(parseClientTab("otra")).toBe("resumen");
    expect(parseClientTab(["cuenta", "actividad"])).toBe("resumen");
  });

  it("Resumen va sin parámetro y las demás con ?pestana=", () => {
    expect(clientTabHref(CLIENT_ID, "resumen")).toBe(`/clientes/${CLIENT_ID}`);
    expect(clientTabHref(CLIENT_ID, "operaciones")).toBe(
      `/clientes/${CLIENT_ID}?pestana=operaciones`,
    );
  });
});
