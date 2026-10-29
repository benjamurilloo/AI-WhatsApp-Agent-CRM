import { describe, expect, it } from "vitest";
import {
  clientSectionsHref,
  conversationFiltersHref,
  DEFAULT_VIEW,
  hasActiveConversationFilters,
  hasMoreFilters,
  parseClientSectionsView,
  parseConversationView,
  toListFilters,
} from "./filters";

const CLIENT_ID = "5eed0000-0000-4000-8000-000100000001";
const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

describe("filtros de la pantalla 8 (brief-6.4)", () => {
  it("sin parámetros usa los valores por defecto, con todas las fechas (D-2)", () => {
    expect(parseConversationView({})).toEqual(DEFAULT_VIEW);
    expect(conversationFiltersHref(DEFAULT_VIEW)).toBe("/conversaciones");
    expect(hasActiveConversationFilters(DEFAULT_VIEW)).toBe(false);
    expect(toListFilters(DEFAULT_VIEW, BUENOS_AIRES)).toEqual({
      from: "",
      to: "",
      status: "open",
      channel: "all",
      clientId: "",
      page: 1,
      sort: "recent",
      pageSize: 25,
      agentPaused: false,
      latestPerClient: true,
    });
  });

  it("reemplaza valores desconocidos por los de defecto", () => {
    expect(
      parseConversationView({
        periodo: "ayer",
        estado: "archivada",
        canal: "telegram",
        pagina: "0",
        orden: "cualquiera",
        filas: "100",
      }),
    ).toEqual(DEFAULT_VIEW);
    expect(parseConversationView({ pagina: ["3", "4"] }).page).toBe(3);
  });

  it("ida y vuelta por la URL conserva cada filtro", () => {
    const view = parseConversationView({
      periodo: "personalizado",
      desde: " 2026-09-01 ",
      hasta: "2026-09-16",
      estado: "pendiente",
      canal: "whatsapp",
      cliente: CLIENT_ID,
      orden: "antigua",
      filas: "50",
      pagina: "2",
    });
    const href = conversationFiltersHref(view);
    expect(href).toBe(
      `/conversaciones?periodo=personalizado&desde=2026-09-01&hasta=2026-09-16&estado=pendiente&canal=whatsapp&cliente=${CLIENT_ID}&orden=antigua&filas=50&pagina=2`,
    );
    const again = parseConversationView(
      Object.fromEntries(new URL(href, "http://x").searchParams),
    );
    expect(again).toEqual(view);
    expect(toListFilters(view, BUENOS_AIRES)).toEqual({
      from: "2026-09-01",
      to: "2026-09-16",
      status: "pending",
      channel: "whatsapp",
      clientId: CLIENT_ID,
      page: 2,
      sort: "oldest",
      pageSize: 50,
      agentPaused: false,
      latestPerClient: true,
    });
  });

  it("brief-24.3.1: la conversación del panel va en ?ver= y la bandeja agrupa por cliente (D-1 y D-2)", () => {
    expect(DEFAULT_VIEW.selected).toBe("");
    const view = parseConversationView({
      ver: `  ${CLIENT_ID}  `,
      estado: "todos",
    });
    expect(view.selected).toBe(CLIENT_ID);
    expect(conversationFiltersHref(view)).toBe(
      `/conversaciones?estado=todos&ver=${CLIENT_ID}`,
    );
    expect(parseConversationView({ ver: ["a", "b"] }).selected).toBe("a");
    expect(toListFilters(view, BUENOS_AIRES).latestPerClient).toBe(true);
  });

  it("brief-24.3: Abiertas por defecto, Todas con estado=todos, y «Atención humana» (D-1 y D-3)", () => {
    expect(DEFAULT_VIEW.status).toBe("abierta");
    const all = parseConversationView({ estado: "todos" });
    expect(all.status).toBe("todos");
    expect(conversationFiltersHref(all)).toBe("/conversaciones?estado=todos");
    expect(toListFilters(all, BUENOS_AIRES).status).toBe("all");
    expect(parseConversationView({ estado: "archivada" }).status).toBe(
      "abierta",
    );

    const human = parseConversationView({
      estado: "pendiente",
      atencion: "humana",
    });
    expect(human.attention).toBe(true);
    expect(toListFilters(human, BUENOS_AIRES).agentPaused).toBe(true);
    expect(conversationFiltersHref(human)).toBe(
      "/conversaciones?estado=pendiente&atencion=humana",
    );
    expect(hasActiveConversationFilters(human)).toBe(true);
    expect(parseConversationView({ atencion: "otra" }).attention).toBe(false);
  });

  it("brief-24.3: «Más filtros» se abre solo con período, canal u orden propios (D-4)", () => {
    expect(hasMoreFilters(DEFAULT_VIEW)).toBe(false);
    expect(hasMoreFilters({ ...DEFAULT_VIEW, status: "todos" })).toBe(false);
    expect(hasMoreFilters({ ...DEFAULT_VIEW, attention: true })).toBe(false);
    expect(hasMoreFilters({ ...DEFAULT_VIEW, period: "7d" })).toBe(true);
    expect(hasMoreFilters({ ...DEFAULT_VIEW, channel: "whatsapp" })).toBe(true);
    expect(hasMoreFilters({ ...DEFAULT_VIEW, sort: "inicio" })).toBe(true);
  });

  it("las fechas solo cuentan con el período personalizado", () => {
    const view = parseConversationView({
      periodo: "7d",
      desde: "2026-09-01",
      hasta: "2026-09-16",
    });
    expect(view.from).toBe("");
    expect(view.to).toBe("");
    expect(conversationFiltersHref(view)).toBe("/conversaciones?periodo=7d");
  });

  it("resuelve los atajos con el día de la organización", () => {
    // 02:00 UTC del 10 es todavía el 9 en Buenos Aires.
    const now = new Date("2026-09-10T02:00:00Z");
    const view = { ...DEFAULT_VIEW, period: "30d" as const };
    expect(toListFilters(view, BUENOS_AIRES, now)).toMatchObject({
      from: "2026-08-11",
      to: "2026-09-09",
    });
    expect(
      toListFilters({ ...view, period: "7d" }, BUENOS_AIRES, now),
    ).toMatchObject({ from: "2026-09-03", to: "2026-09-09" });
  });

  it("un cliente elegido manda sobre la búsqueda pendiente (D-1)", () => {
    const chosen = parseConversationView({
      cliente: CLIENT_ID,
      buscar_cliente: "María",
    });
    expect(chosen.clientSearch).toBe("");
    expect(conversationFiltersHref(chosen)).toBe(
      `/conversaciones?cliente=${CLIENT_ID}`,
    );

    const searching = parseConversationView({ buscar_cliente: "  María  " });
    expect(searching.clientSearch).toBe("María");
    expect(hasActiveConversationFilters(searching)).toBe(true);
    expect(conversationFiltersHref(searching)).toBe(
      "/conversaciones?buscar_cliente=Mar%C3%ADa",
    );
    expect(
      parseConversationView({ buscar_cliente: "x".repeat(300) }).clientSearch,
    ).toHaveLength(100);
  });
});

describe("parámetros de la pantalla 7 (D-4)", () => {
  it("cada sección conserva los parámetros de la otra", () => {
    const view = parseClientSectionsView({
      auditoria: "2",
      estado_conv: "cerrada",
      pagina_conv: "3",
    });
    expect(view).toEqual({
      auditPage: 2,
      conversationStatus: "cerrada",
      conversationPage: 3,
    });
    expect(clientSectionsHref(CLIENT_ID, { ...view, auditPage: 3 })).toBe(
      `/clientes/${CLIENT_ID}?pestana=actividad&auditoria=3&estado_conv=cerrada&pagina_conv=3`,
    );
    // Desde la 24.4.1, sin filtros sigue en la pestaña Actividad.
    expect(
      clientSectionsHref(CLIENT_ID, {
        auditPage: 1,
        conversationStatus: "todos",
        conversationPage: 1,
      }),
    ).toBe(`/clientes/${CLIENT_ID}?pestana=actividad`);
    expect(parseClientSectionsView({ estado_conv: "otra" })).toEqual({
      auditPage: 1,
      conversationStatus: "todos",
      conversationPage: 1,
    });
  });
});
