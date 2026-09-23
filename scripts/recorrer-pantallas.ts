// Recorre las 10 pantallas del MVP contra un entorno desplegado y **recoge los errores de
// consola** (9.3, AC-10). Uso:
//
//   CRM_BASE_URL=https://staging.vixoraai.app CRM_EMAIL=… CRM_PASSWORD=… \
//     npx tsx scripts/recorrer-pantallas.ts
//
// Por qué existe, si ya hay una suite end-to-end: la suite necesita vaciar y sembrar su propia
// base antes de cada caso, así que apuntarla a staging exigiría un túnel hasta el PostgreSQL del
// droplet y cambiar su configuración. Este recorrido **no escribe nada**: entra, navega y mira.
// Esa diferencia es la que lo hace posible contra un entorno real.
//
// Los identificadores de las pantallas de detalle no se escriben a mano: se sacan **haciendo clic
// en la primera fila de cada lista**, que es como llega ahí quien usa la aplicación. Un id
// inventado probaría que la ruta responde, no que la lista lleva a ella.
//
// Lo que este recorrido NO cubre, declarado:
// - accesibilidad (axe) ni el tema oscuro: eso lo cubre la suite end-to-end en la base local;
// - las pantallas de alta (`/nuevo`) ni la edición: no son de las 10 numeradas y escribirían;
// - cualquier cosa que ocurra después de un clic que escriba. Este recorrido es de solo lectura.

import { chromium, type ConsoleMessage, type Page } from "@playwright/test";

type Problema = { pantalla: string; tipo: string; detalle: string };

const BASE = process.env.CRM_BASE_URL;
const EMAIL = process.env.CRM_EMAIL;
const PASSWORD = process.env.CRM_PASSWORD;

const problemas: Problema[] = [];
let pantallaActual = "(antes de empezar)";

function registrar(tipo: string, detalle: string): void {
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

async function visitar(
  page: Page,
  numero: number,
  nombre: string,
  ruta: string,
  esperado: RegExp,
): Promise<{
  numero: number;
  nombre: string;
  ruta: string;
  ms: number;
  ok: boolean;
}> {
  pantallaActual = `${numero}. ${nombre}`;
  const desde = performance.now();
  const respuesta = await page.goto(ruta, { waitUntil: "load" });
  const estado = respuesta?.status() ?? 0;
  if (estado >= 400) registrar("http", `${estado} en ${ruta}`);
  // La espera es por contenido y no por un tiempo fijo: un `waitForTimeout` mediría la espera.
  let ok = true;
  try {
    await page.getByText(esperado).first().waitFor({ timeout: 20_000 });
  } catch {
    ok = false;
    registrar("contenido", `no apareció ${esperado} en ${ruta}`);
  }
  const ms = performance.now() - desde;
  return { numero, nombre, ruta, ms, ok };
}

async function main(): Promise<void> {
  if (!BASE || !EMAIL || !PASSWORD) {
    throw new Error("Faltan CRM_BASE_URL, CRM_EMAIL o CRM_PASSWORD.");
  }

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ baseURL: BASE });
  const page = await contexto.newPage();

  page.on("console", (mensaje: ConsoleMessage) => {
    if (mensaje.type() === "error") registrar("consola", mensaje.text());
  });
  // Una excepción no capturada no llega como mensaje de consola: si solo se escuchara `console`,
  // el error más grave de todos pasaría sin registrarse.
  page.on("pageerror", (error) => registrar("excepción", error.message));
  page.on("requestfailed", (request) => {
    const falla = request.failure()?.errorText ?? "?";
    // `net::ERR_ABORTED` es lo que deja una navegación que se reemplaza; no es un fallo.
    if (falla.includes("ERR_ABORTED")) return;
    registrar("red", `${falla} ${request.url()}`);
  });

  pantallaActual = "1. Inicio de sesión";
  await page.goto("/login", { waitUntil: "load" });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });

  const filas: {
    numero: number;
    nombre: string;
    ruta: string;
    ms: number;
    ok: boolean;
  }[] = [];

  // Control negativo (CRM_CONTROL=1). Un recorrido que informa «0 problemas» y uno cuyos oyentes
  // nunca se dispararon se ven **idénticos**. Este modo provoca las tres clases de problema que
  // el recorrido dice detectar; si con él no salen tres, el verde del modo normal no vale nada.
  if (process.env.CRM_CONTROL === "1") {
    pantallaActual = "control negativo";
    await page.goto("/", { waitUntil: "load" });
    await page.evaluate(() => {
      console.error("control negativo: error de consola provocado");
      setTimeout(() => {
        throw new Error("control negativo: excepción provocada");
      }, 0);
    });
    await page.evaluate(
      () => void fetch("/ruta-que-no-existe-control-negativo").catch(() => {}),
    );
    filas.push(
      await visitar(
        page,
        2,
        "Dashboard (control)",
        "/",
        /texto-que-no-puede-estar-en-la-pantalla/,
      ),
    );
    console.log(
      `\nCONTROL NEGATIVO: ${problemas.length} problemas detectados (se esperan 3 o más).`,
    );
    for (const p of problemas) console.log(`- [${p.tipo}] ${p.detalle}`);
    await navegador.close();
    process.exitCode = problemas.length >= 3 ? 0 : 1;
    return;
  }

  filas.push(await visitar(page, 2, "Dashboard", "/", /Dashboard/));
  filas.push(
    await visitar(page, 3, "Lista de productos", "/productos", /Productos/),
  );

  const productoId = await primerId(page, "/productos");
  if (productoId) {
    filas.push(
      await visitar(
        page,
        4,
        "Detalle de producto",
        `/productos/${productoId}`,
        /Stock|SKU/,
      ),
    );
    filas.push(
      await visitar(
        page,
        5,
        "Historial de movimientos",
        `/productos/${productoId}/movimientos`,
        /Movimientos|Historial/,
      ),
    );
  } else {
    registrar(
      "navegación",
      "la lista de productos no ofreció ningún enlace a un detalle",
    );
  }

  filas.push(
    await visitar(page, 6, "Lista de clientes", "/clientes", /Clientes/),
  );
  const clienteId = await primerId(page, "/clientes");
  if (clienteId) {
    filas.push(
      await visitar(
        page,
        7,
        "Detalle de cliente",
        `/clientes/${clienteId}`,
        /Cliente|Teléfono/,
      ),
    );
  } else {
    registrar(
      "navegación",
      "la lista de clientes no ofreció ningún enlace a un detalle",
    );
  }

  filas.push(
    await visitar(
      page,
      8,
      "Lista de conversaciones",
      "/conversaciones",
      /Conversaciones/,
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
        /Conversación|Mensajes/,
      ),
    );
  } else {
    registrar(
      "navegación",
      "la lista de conversaciones no ofreció ningún enlace a un detalle",
    );
  }

  filas.push(
    await visitar(page, 10, "Usuarios y roles", "/usuarios", /Usuarios/),
  );

  console.log(`\n## Recorrido de las 10 pantallas — ${BASE}\n`);
  console.log("| # | Pantalla | Ruta | Carga | Contenido |");
  console.log("| --- | --- | --- | --- | --- |");
  console.log("| 1 | Inicio de sesión | /login | — | ingreso correcto |");
  for (const f of filas) {
    console.log(
      `| ${f.numero} | ${f.nombre} | \`${f.ruta}\` | ${f.ms.toFixed(0)} ms | ${f.ok ? "ok" : "**NO APARECIÓ**"} |`,
    );
  }

  console.log(
    `\n**Problemas registrados: ${problemas.length}** (errores de consola, excepciones, red y contenido).`,
  );
  for (const p of problemas) {
    console.log(`- [${p.tipo}] ${p.pantalla}: ${p.detalle}`);
  }

  await navegador.close();
  if (problemas.length > 0 || filas.some((f) => !f.ok)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
