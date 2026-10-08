import { expect, test } from "@playwright/test";

// API de lectura v1 sobre next start (brief-11.3, D-11; O-22 de la evaluación 10.1).
//
// Lo que prueba: que proxy.ts aplica sus cabeceras a las rutas nuevas, y que la API arranca
// apagada. Los end-to-end corren sin READ_API_ENABLED, así que cada ruta responde 404 sin cuerpo:
// es la conducta del modo de prueba (D-7). proxy.ts agrega las cabeceras a toda respuesta de las
// rutas que cubre su `matcher`, sin mirar qué devolvió la ruta, así que el 404 alcanza para ver
// si la ruta está cubierta.
//
// Lo que no prueba: una lectura con la API encendida sobre next start. Encenderla exigiría tocar
// playwright.config.ts y la preparación global, fuera de la lista del brief. Las lecturas se
// prueban contra PostgreSQL real en tests/integration/read-api.test.ts. Los requests son
// sintéticos: nada de esto es evidencia de integración con el agente.

const ROUTES = [
  "/api/read/v1/products?q=auriculares",
  "/api/read/v1/products/0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b",
  "/api/read/v1/knowledge?q=horarios",
  // El historial (brief-12.4).
  "/api/read/v1/messages?conversation_ref=conv-propuesta-0001",
  // El catálogo de etiquetas (brief-16.2).
  "/api/read/v1/client-tags",
  // La marca de pausa del agente (brief-16.3).
  "/api/read/v1/conversation-state?conversation_ref=conv-propuesta-0001",
  // La cantidad disponible de un producto (brief-16.6).
  "/api/read/v1/products/0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b/stock",
];

for (const route of ROUTES) {
  test(`O-22: ${route.split("?")[0]} recibe las cabeceras de proxy.ts y está apagada por defecto`, async ({
    request,
  }) => {
    const response = await request.get(route, {
      headers: { authorization: `Bearer crm_read_${"e".repeat(43)}` },
    });
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("");

    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("same-origin");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["cache-control"]).toBe("no-store");
  });
}
