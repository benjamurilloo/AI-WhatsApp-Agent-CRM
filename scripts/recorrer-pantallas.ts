// Recorre las 10 pantallas del MVP, más la 5b (precios, 11.1), la 11 y la 12 (información del
// negocio, 11.2) y la 13 (etiquetas de clientes, 16.1), contra un entorno desplegado y **recoge los errores de consola, las
// excepciones, las fallas de red, las respuestas HTTP de error y el contenido que no aparece**
// (9.3, AC-10; corregido en la 11.0; las tres pantallas nuevas, en la 11.4, D-8). Uso:
//
//   CRM_BASE_URL=https://staging.vixoraai.app CRM_EMAIL=… CRM_PASSWORD=… \
//     npx tsx scripts/recorrer-pantallas.ts
//
// Con `CRM_CONTROL=1` corre el control negativo (ver abajo) en vez del recorrido.
//
// Por qué existe, si ya hay una suite end-to-end: la suite necesita vaciar y sembrar su propia
// base antes de cada caso, así que apuntarla a staging exigiría un túnel hasta el PostgreSQL del
// droplet y cambiar su configuración. Este recorrido **no escribe datos de negocio**: entra,
// navega, mira y sale. Esa diferencia es la que lo hace posible contra un entorno real.
//
// Lo que **sí** escribe, declarado (R-21 de la revisión de la 9.3): el ingreso crea una sesión,
// limpia los fallos de ingreso de la cuenta y borra sus sesiones vencidas. Desde la 11.0 el
// recorrido sale con «Salir» al terminar y comprueba que la cookie anterior ya no entra, así que
// la sesión se borra y no se acumulan en la base.
// Si el recorrido se corta antes, la sesión queda hasta que vence.
//
// Los identificadores de las pantallas de detalle no se escriben a mano: se sacan **haciendo clic
// en la primera fila de cada lista**, que es como llega ahí quien usa la aplicación. Un id
// inventado probaría que la ruta responde, no que la lista lleva a ella.
//
// Cómo se comprueba el contenido (R-7 de la revisión de la 9.3, corregido en la 11.0): **dentro
// de `main`**, con un elemento propio de cada pantalla —un encabezado de columna o de sección—, y
// no con un texto buscado en la página entera. La versión de la 9.3 buscaba `/Productos/`,
// `/Clientes/` y otros rótulos que el menú muestra en todas las pantallas, así que en 6 de 9 la
// comprobación pasaba aunque la pantalla estuviera vacía.
//
// Lo que este recorrido NO cubre, declarado:
// - accesibilidad (axe) ni el tema oscuro: eso lo cubre la suite end-to-end en la base local;
// - las pantallas de alta (`/nuevo`) ni la edición: no son de las 10 numeradas y escribirían;
// - cualquier cosa que ocurra después de un clic que escriba.

import { existsSync, readFileSync } from "node:fs";
import {
  chromium,
  type ConsoleMessage,
  type Locator,
  type Page,
} from "@playwright/test";

type Clase = "consola" | "excepción" | "red" | "http" | "contenido";
type Problema = {
  pantalla: string;
  tipo: Clase | "navegación";
  detalle: string;
};

const BASE = process.env.CRM_BASE_URL;
const EMAIL = process.env.CRM_EMAIL;
const PASSWORD = process.env.CRM_PASSWORD;
const CONTROL = process.env.CRM_CONTROL === "1";
// Solo para el control negativo: desactiva el registro de una clase, para demostrar que el
// control se pone en rojo cuando un oyente deja de funcionar (11.0, AC-2). Fuera del control se
// rechaza, para que nadie pueda correr el recorrido real con un oyente apagado.
const SIN_CLASE = process.env.CRM_CONTROL_SIN_CLASE;

const problemas: Problema[] = [];
let pantallaActual = "(antes de empezar)";

function registrar(tipo: Problema["tipo"], detalle: string): void {
  if (tipo === SIN_CLASE) return;
  problemas.push({
    pantalla: pantallaActual,
    tipo,
    detalle: detalle.slice(0, 300),
  });
}

// Un id de la primera fila de una lista, sacado del href. Devuelve null si la lista está vacía,
// que es un resultado distinto de un error y se informa como tal.
async function primerId(page: Page, prefijo: string): Promise<string | null> {
  const enlaces = page.locator(`a[href^="${prefijo}/"]`);
  const total = await enlaces.count();
  for (let i = 0; i < total; i++) {
    const href = await enlaces.nth(i).getAttribute("href");
    if (!href) continue;
    const resto = href.slice(prefijo.length + 1).split(/[/?#]/)[0] ?? "";
    // Un UUID, no `nuevo` ni una ruta de acción.
    if (/^[0-9a-f-]{36}$/i.test(resto)) return resto;
  }
  return null;
}

// Lo que tiene que aparecer dentro de `main` para que la pantalla cuente como cargada. `revisar`,
// si está, mira además el estado de lo que apareció y devuelve el problema, o null.
type Esperado = {
  describe: string;
  buscar: (main: Locator) => Locator;
  revisar?: (main: Locator, espera: number) => Promise<string | null>;
};

const columna = (nombre: string): Esperado => ({
  describe: `columna «${nombre}»`,
  buscar: (main) =>
    main.getByRole("columnheader", { name: nombre, exact: true }),
});
// Con un texto, el nombre es exacto: por defecto Playwright compara por subcadena y sin
// mayúsculas, y `Stock` coincidiría con un producto que se llame «Restock» (M-1 de la revisión
// independiente de la 11.0).
const encabezado = (nombre: string | RegExp): Esperado => ({
  describe: `encabezado «${String(nombre)}»`,
  buscar: (main) =>
    main.getByRole("heading", {
      name: nombre,
      exact: typeof nombre === "string",
    }),
});

// El texto de una tarjeta que falló y el del esqueleto mientras carga
// (`src/app/(autenticado)/_dashboard/messages.ts` y `metric-card.tsx`). Se copian acá porque el
// script no importa la aplicación; si cambian allá, el control de abajo se pone en rojo.
const TARJETA_EN_ERROR = "No se pudo calcular.";
const TARJETA_CARGANDO = "░░░░";

// El dashboard: el encabezado de la métrica 1 se dibuja en los tres estados de la tarjeta —
// cargando, en error y con valor—, así que por sí solo no prueba nada, y una métrica que falla se
// muestra con HTTP 200 y sin error de consola (M-1 de la revisión independiente de la 11.0). Por
// eso, además, ninguna tarjeta puede quedar cargando ni en error.
const DASHBOARD: Esperado = {
  describe: "las tarjetas del dashboard con valor",
  buscar: (main) =>
    main.getByRole("heading", { name: /Conversaciones iniciadas/ }),
  revisar: async (main, espera) => {
    try {
      await main
        .getByText(TARJETA_CARGANDO, { exact: true })
        .first()
        .waitFor({ state: "detached", timeout: espera });
    } catch {
      return "hay tarjetas que no terminaron de cargar";
    }
    const errores = await main
      .getByText(TARJETA_EN_ERROR, { exact: true })
      .count();
    return errores > 0 ? `${errores} tarjetas en error` : null;
  },
};

type Fila = {
  numero: number | string;
  nombre: string;
  ruta: string;
  ms: number;
  ok: boolean;
};

async function visitar(
  page: Page,
  numero: number | string,
  nombre: string,
  ruta: string,
  esperado: Esperado,
  espera = 20_000,
): Promise<Fila> {
  pantallaActual = `${numero}. ${nombre}`;
  const desde = performance.now();
  // El estado HTTP lo registra el oyente de `response`, que ve esta navegación y cualquier otra
  // petición de la pantalla.
  await page.goto(ruta, { waitUntil: "load" });
  // La espera es por contenido y no por un tiempo fijo: un `waitForTimeout` mediría la espera.
  let ok = true;
  const main = page.getByRole("main");
  try {
    await esperado.buscar(main).first().waitFor({ timeout: espera });
  } catch {
    ok = false;
    registrar("contenido", `no apareció ${esperado.describe} en ${ruta}`);
  }
  if (ok && esperado.revisar) {
    const problema = await esperado.revisar(main, espera);
    if (problema) {
      ok = false;
      registrar("contenido", `${problema} en ${ruta}`);
    }
  }
  const ms = performance.now() - desde;
  return { numero, nombre, ruta, ms, ok };
}

function oyentes(page: Page): void {
  page.on("console", (mensaje: ConsoleMessage) => {
    if (mensaje.type() === "error") registrar("consola", mensaje.text());
  });
  // Una excepción no capturada no llega como mensaje de consola: si solo se escuchara `console`,
  // el error más grave de todos pasaría sin registrarse.
  page.on("pageerror", (error) => registrar("excepción", error.message));
  // `requestfailed` solo se dispara cuando no hubo respuesta HTTP. Verificado en
  // playwright-core@1.63.0 (types.d.ts:1165-1170): «HTTP Error responses, such as 404 or 503, are
  // still successful responses from HTTP standpoint». Por eso un 404 o un 500 se ven con
  // `response`, en su propia clase. La versión de la 9.3 solo escuchaba `requestfailed` para
  // subrecursos y fetch, así que ninguna respuesta de error de una pantalla podía registrarse
  // (R-8 de la revisión de la 9.3).
  page.on("requestfailed", (request) => {
    const falla = request.failure()?.errorText ?? "?";
    // `net::ERR_ABORTED` es lo que deja una navegación que se reemplaza; no es un fallo.
    if (falla.includes("ERR_ABORTED")) return;
    registrar("red", `${falla} ${request.url()}`);
  });
  page.on("response", (respuesta) => {
    if (respuesta.status() >= 400) {
      registrar("http", `${respuesta.status()} ${respuesta.url()}`);
    }
  });
}

async function ingresar(page: Page): Promise<void> {
  pantallaActual = "1. Inicio de sesión";
  await page.goto("/login", { waitUntil: "load" });
  await page.getByLabel("Email").fill(EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

// Sale por el botón del marco común, que borra la sesión en la base (R-21).
async function salir(page: Page): Promise<void> {
  pantallaActual = "salida";
  await page.goto("/", { waitUntil: "load" });
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

// Control negativo (CRM_CONTROL=1). Un recorrido que informa «0 problemas» y uno cuyos oyentes
// nunca se dispararon se ven **idénticos**. Este modo provoca **cada clase por separado** y exige
// al menos una detección **en cada una**. La versión de la 9.3 exigía tres problemas en total, así
// que dos clases que no detectaban nada podían quedar tapadas por otra que detectaba de más (R-8).
async function controlNegativo(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "load" });

  pantallaActual = "control: consola";
  await page.evaluate(() => {
    console.error("control negativo: error de consola provocado");
  });

  pantallaActual = "control: excepción";
  await Promise.all([
    page.waitForEvent("pageerror", { timeout: 5_000 }).catch(() => null),
    page.evaluate(() => {
      setTimeout(() => {
        throw new Error("control negativo: excepción provocada");
      }, 0);
    }),
  ]);

  // Una petición sin respuesta: se aborta en el navegador, que es lo que ve `requestfailed`.
  pantallaActual = "control: red";
  await page.route("**/control-negativo-red", (ruta) => ruta.abort("failed"));
  await Promise.all([
    page.waitForEvent("requestfailed", { timeout: 5_000 }).catch(() => null),
    page.evaluate(
      () => void fetch("/control-negativo-red").catch(() => undefined),
    ),
  ]);

  // Una respuesta HTTP de error de verdad, del servidor.
  pantallaActual = "control: http";
  await Promise.all([
    page
      .waitForEvent("response", {
        predicate: (r) => r.url().includes("/ruta-que-no-existe-control"),
        timeout: 10_000,
      })
      .catch(() => null),
    page.evaluate(
      () => void fetch("/ruta-que-no-existe-control").catch(() => undefined),
    ),
  ]);

  // Un contenido que la pantalla no tiene.
  await visitar(
    page,
    2,
    "control: contenido",
    "/",
    encabezado("Encabezado que no existe en ninguna pantalla"),
    3_000,
  );

  // Un dashboard con una tarjeta en error y otro con una tarjeta que no termina de cargar,
  // servidos por el navegador con HTTP 200: es lo que la comprobación del dashboard tiene que ver
  // aunque no haya ningún error de consola ni de red (M-1).
  for (const [ruta, estado] of [
    ["/control-tarjeta-en-error", TARJETA_EN_ERROR],
    ["/control-tarjeta-cargando", TARJETA_CARGANDO],
  ] as const) {
    await page.route(`**${ruta}`, (r) =>
      r.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<main><h3>1 Conversaciones iniciadas</h3><p>${estado}</p></main>`,
      }),
    );
    await visitar(page, 2, `control: ${ruta}`, ruta, DASHBOARD, 3_000);
  }

  // Cada provocación tiene que aparecer **en su clase y con su propio texto**. Contar por clase
  // no alcanzaba: el 404 del paso http también deja un error de consola, así que un oyente de
  // consola que ignorara los `console.error` de la aplicación seguía en verde (m-1 de la revisión
  // independiente de la 11.0).
  const esperadas: [Clase, string][] = [
    ["consola", "control negativo: error de consola provocado"],
    ["excepción", "control negativo: excepción provocada"],
    ["red", "/control-negativo-red"],
    ["http", "/ruta-que-no-existe-control"],
    ["contenido", "Encabezado que no existe en ninguna pantalla"],
    ["contenido", "tarjetas en error en /control-tarjeta-en-error"],
    ["contenido", "no terminaron de cargar en /control-tarjeta-cargando"],
  ];

  console.log("\n## Control negativo — una detección por provocación\n");
  const faltan: string[] = [];
  for (const [clase, texto] of esperadas) {
    const vista = problemas.some(
      (p) => p.tipo === clase && p.detalle.includes(texto),
    );
    console.log(`- ${clase} «${texto}»: ${vista ? "detectada" : "NO"}`);
    if (!vista) faltan.push(`${clase} «${texto}»`);
  }

  // Los textos del dashboard están copiados de la aplicación: si allá cambian, la comprobación
  // real deja de verlos aunque este control siga en verde con sus páginas sintéticas. Se leen del
  // código cuando está disponible, que es donde corre este script (local o el checkout de staging).
  for (const [archivo, texto] of [
    ["src/app/(autenticado)/_dashboard/messages.ts", TARJETA_EN_ERROR],
    ["src/app/(autenticado)/_dashboard/metric-card.tsx", TARJETA_CARGANDO],
  ] as const) {
    const presente =
      existsSync(archivo) && readFileSync(archivo, "utf8").includes(texto);
    console.log(`- texto «${texto}» en ${archivo}: ${presente ? "sí" : "NO"}`);
    if (!presente) faltan.push(`texto «${texto}» en ${archivo}`);
  }

  for (const p of problemas) {
    console.log(`  - [${p.tipo}] ${p.pantalla}: ${p.detalle}`);
  }
  if (faltan.length > 0) {
    console.log(
      `\n**CONTROL EN ROJO**: sin detección de ${faltan.join("; ")}. El verde del recorrido no vale.`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nControl en verde: cada provocación se detectó en su clase.");
  }
}

async function recorrido(page: Page): Promise<void> {
  const filas: Fila[] = [];

  filas.push(await visitar(page, 2, "Dashboard", "/", DASHBOARD));
  filas.push(
    await visitar(page, 3, "Lista de productos", "/productos", columna("SKU")),
  );

  const productoId = await primerId(page, "/productos");
  if (productoId) {
    filas.push(
      await visitar(
        page,
        4,
        "Detalle de producto",
        `/productos/${productoId}`,
        encabezado("Stock"),
      ),
    );
    // A la 5b se llega por el enlace del detalle, no armando la ruta: se comprueba que esté.
    const precios = `/productos/${productoId}/precios`;
    const hayEnlaceAPrecios =
      (await page.locator(`main a[href="${precios}"]`).count()) > 0;
    if (!hayEnlaceAPrecios) {
      registrar(
        "navegación",
        "el detalle del producto no ofreció el enlace a sus precios",
      );
    }
    filas.push(
      await visitar(
        page,
        5,
        "Historial de movimientos",
        `/productos/${productoId}/movimientos`,
        encabezado("Historial de movimientos"),
      ),
    );
    if (hayEnlaceAPrecios) {
      filas.push(
        await visitar(
          page,
          "5b",
          "Precios de un producto",
          precios,
          encabezado("Historial de precios"),
        ),
      );
    }
  } else {
    registrar(
      "navegación",
      "la lista de productos no ofreció ningún enlace a un detalle",
    );
  }

  filas.push(
    await visitar(
      page,
      6,
      "Lista de clientes",
      "/clientes",
      columna("Última interacción"),
    ),
  );
  const clienteId = await primerId(page, "/clientes");
  if (clienteId) {
    filas.push(
      await visitar(page, 7, "Detalle de cliente", `/clientes/${clienteId}`, {
        describe: "dato «Teléfono»",
        buscar: (main) => main.locator("dt", { hasText: /^Teléfono$/ }),
      }),
    );
  } else {
    registrar(
      "navegación",
      "la lista de clientes no ofreció ningún enlace a un detalle",
    );
  }

  // Con el catálogo vacío no hay tabla: se comprueba el encabezado de la página (16.1).
  filas.push(
    await visitar(
      page,
      13,
      "Etiquetas de clientes",
      "/clientes/etiquetas",
      encabezado("Etiquetas de clientes"),
    ),
  );

  filas.push(
    await visitar(
      page,
      8,
      "Lista de conversaciones",
      "/conversaciones",
      columna("Canal"),
    ),
  );
  const conversacionId = await primerId(page, "/conversaciones");
  if (conversacionId) {
    filas.push(
      await visitar(
        page,
        9,
        "Detalle de conversación",
        `/conversaciones/${conversacionId}`,
        encabezado("Mensajes"),
      ),
    );
  } else {
    registrar(
      "navegación",
      "la lista de conversaciones no ofreció ningún enlace a un detalle",
    );
  }

  filas.push(
    await visitar(page, 10, "Usuarios y roles", "/usuarios", columna("Rol")),
  );

  filas.push(
    await visitar(
      page,
      11,
      "Información del negocio",
      "/informacion",
      columna("Vigencia"),
    ),
  );
  const entradaId = await primerId(page, "/informacion");
  if (entradaId) {
    filas.push(
      await visitar(
        page,
        12,
        "Detalle de una entrada",
        `/informacion/${entradaId}`,
        encabezado("Datos"),
      ),
    );
  } else {
    registrar(
      "navegación",
      "la lista de información del negocio no ofreció ningún enlace a un detalle",
    );
  }

  console.log(`\n## Recorrido de las 14 pantallas — ${BASE}\n`);
  console.log("| # | Pantalla | Ruta | Carga | Contenido |");
  console.log("| --- | --- | --- | --- | --- |");
  console.log("| 1 | Inicio de sesión | /login | — | ingreso correcto |");
  for (const f of filas) {
    console.log(
      `| ${f.numero} | ${f.nombre} | \`${f.ruta}\` | ${f.ms.toFixed(0)} ms | ${f.ok ? "ok" : "**NO APARECIÓ**"} |`,
    );
  }

  console.log(
    `\n**Problemas registrados: ${problemas.length}** (consola, excepción, red, http, contenido y navegación).`,
  );
  for (const p of problemas) {
    console.log(`- [${p.tipo}] ${p.pantalla}: ${p.detalle}`);
  }
  if (problemas.length > 0 || filas.some((f) => !f.ok)) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (!BASE || !EMAIL || !PASSWORD) {
    throw new Error("Faltan CRM_BASE_URL, CRM_EMAIL o CRM_PASSWORD.");
  }
  if (SIN_CLASE && !CONTROL) {
    throw new Error("CRM_CONTROL_SIN_CLASE solo se admite con CRM_CONTROL=1.");
  }

  const navegador = await chromium.launch();
  try {
    const contexto = await navegador.newContext({ baseURL: BASE });
    const page = await contexto.newPage();
    oyentes(page);
    await ingresar(page);
    if (CONTROL) await controlNegativo(page);
    else await recorrido(page);
    // Lo que falle al salir también cuenta: una salida rota deja la sesión viva en la base.
    const antes = problemas.length;
    const cookies = await contexto.cookies();
    await salir(page);
    // Que «Salir» lleve a /login no prueba que la sesión se borró: `logoutAction` registra un
    // fallo de `logout()` y redirige igual (m-2 de la revisión independiente de la 11.0). Se
    // prueba con la consecuencia: la cookie de antes, en un contexto nuevo, ya no entra.
    const otro = await navegador.newContext({ baseURL: BASE });
    await otro.addCookies(cookies);
    const prueba = await otro.newPage();
    await prueba.goto("/", { waitUntil: "load" });
    if (!new URL(prueba.url()).pathname.startsWith("/login")) {
      registrar("navegación", "la sesión sigue válida después de salir");
    } else {
      console.log("\nSesión cerrada: la cookie anterior ya no entra.");
    }
    await otro.close();
    for (const p of problemas.slice(antes)) {
      console.log(`- [${p.tipo}] ${p.pantalla}: ${p.detalle}`);
      if (!CONTROL) process.exitCode = 1;
    }
  } finally {
    await navegador.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
