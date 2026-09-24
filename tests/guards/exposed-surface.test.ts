import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de la superficie expuesta (brief-8.4, D-4). La 8.4 revisó punto por punto qué exige
// sesión y qué rol, y ese trabajo vale para el commit en que se hizo: una Server Action nueva
// sin autorización es un hallazgo crítico y hoy nada lo detecta salvo que alguien la mire.
//
// Lo que esta guarda comprueba: que la superficie no crezca ni se encoja en silencio. Cada
// Server Action exportada y cada Route Handler de src/app está declarado abajo con su exigencia,
// y cada entrada declarada sigue existiendo.
//
// Lo que NO comprueba, y conviene no confundir: que la exigencia declarada se cumpla de verdad.
// Eso se verificó leyendo cada punto de entrada en la 8.4, y no se puede reducir a un patrón de
// texto sin mentir — la autorización se delega (inventory autoriza a través de catalog) o vive en
// un helper del mismo archivo (runProductChange). Un recuento de `authorize(` da 14 contra 1 en
// analytics y no significa nada: las doce métricas pasan por withPeriod.
//
// Por eso el valor está en el diff: agregar una entrada acá es un cambio visible que alguien
// tiene que justificar, no un archivo nuevo que nadie mira.

type Requirement =
  | "sesion" // requireSession antes de cualquier efecto; el rol lo exige el módulo
  | "previo-a-la-sesion" // parte del flujo de ingreso o de cambio obligatorio
  | "sin-sesion"; // público a propósito, con su razón

type Entry = { readonly requirement: Requirement; readonly why?: string };

// Server Actions, por archivo y nombre exportado.
const ACTIONS: Readonly<Record<string, Entry>> = {
  "src/app/(autenticado)/clientes/actions.ts#createClientAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/clientes/actions.ts#updateClientAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/clientes/actions.ts#deactivateClientAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/clientes/actions.ts#reactivateClientAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/conversaciones/actions.ts#changeConversationStatusAction":
    { requirement: "sesion" },
  "src/app/(autenticado)/conversaciones/actions.ts#loadOlderMessagesAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/informacion/actions.ts#createKnowledgeAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/informacion/actions.ts#updateKnowledgeAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/informacion/actions.ts#deactivateKnowledgeAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/informacion/actions.ts#reactivateKnowledgeAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/productos/actions.ts#createProductAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/productos/actions.ts#updateProductAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/productos/actions.ts#deactivateProductAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/productos/actions.ts#reactivateProductAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/productos/actions.ts#adjustStockAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/productos/[productId]/precios/actions.ts#setPriceAction":
    { requirement: "sesion" },
  "src/app/(autenticado)/usuarios/actions.ts#createMemberAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/usuarios/actions.ts#changeRoleAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/usuarios/actions.ts#deactivateMemberAction": {
    requirement: "sesion",
  },
  "src/app/(autenticado)/usuarios/actions.ts#reactivateMemberAction": {
    requirement: "sesion",
  },
  "src/app/login/actions.ts#loginAction": {
    requirement: "previo-a-la-sesion",
    why: "es el ingreso; su defensa es el límite de intentos por cuenta y por IP",
  },
  "src/app/cambiar-contrasena/actions.ts#changePasswordAction": {
    requirement: "previo-a-la-sesion",
    why: "corre con must_change_password en true, que es una sesión que solo permite esto",
  },
  "src/app/_auth/logout.ts#logoutAction": {
    requirement: "sin-sesion",
    why: "cerrar sesión sin sesión es idempotente; exigirla daría un error donde el usuario espera salir",
  },
  "src/app/_theme/actions.ts#setThemeAction": {
    requirement: "sin-sesion",
    why: "escribe la cookie de tema, que no es un dato de negocio y existe también en la pantalla de ingreso",
  },
};

// Route Handlers, por archivo.
const HANDLERS: Readonly<Record<string, Entry>> = {
  "src/app/api/health/route.ts": {
    requirement: "sin-sesion",
    why: "devuelve solo si la base responde, sin datos ni versiones, con Cache-Control no-store",
  },
  "src/app/api/ingestion/v1/events/route.ts": {
    requirement: "sin-sesion",
    why: "no usa la sesión: autentica con una credencial de servicio (brief-6.5.3) y una sesión válida no lo autentica",
  },
};

const APP_FILES = execFileSync("git", ["ls-files", "-z", "src/app"], {
  encoding: "utf8",
})
  .split("\0")
  .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));

const SELF = "tests/guards/exposed-surface.test.ts";

// "use server" al principio del archivo: la directiva que convierte sus exportadas en Server
// Actions. No busca la variante por función porque el proyecto no la usa.
export function isServerActionModule(text: string): boolean {
  return /^\s*["']use server["']\s*;/m.test(text);
}

// Dos formas de exportar una Server Action: la declaración `export function` y la asignación
// `export const x = async () => {}`, que Next acepta igual. La segunda se agregó tras la
// revisión independiente de la 8.4: la guarda original solo veía la primera, así que una
// acción escrita como constante habría entrado sin declararse y la mutación que la validó
// usó justamente la forma que sí detectaba.
const EXPORTED_FUNCTION =
  /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]*?)?=>|[A-Za-z_$][\w$]*\s*=>)/gm;

export function exportedFunctions(text: string): string[] {
  return [...text.matchAll(EXPORTED_FUNCTION)]
    .map((match) => match[1] ?? match[2])
    .filter((name): name is string => name !== undefined);
}

describe("detección de módulos de Server Actions", () => {
  it.each(['"use server";', "  'use server';", '\n\n"use server";\n'])(
    "detecta: %j",
    (text) => {
      expect(isServerActionModule(text)).toBe(true);
    },
  );

  it.each([
    '// "use server" en un comentario',
    'const x = "use server";',
    '"use client";',
  ])("no detecta: %j", (text) => {
    expect(isServerActionModule(text)).toBe(false);
  });
});

describe("detección de funciones exportadas", () => {
  it("encuentra las exportadas y no las internas", () => {
    const text = [
      "export async function unaAccion(formData: FormData) {}",
      "export function otra() {}",
      "async function interna() {}",
      "export const noEsFuncion = 1;",
    ].join("\n");

    expect(exportedFunctions(text)).toEqual(["unaAccion", "otra"]);
  });

  // Caso que falla con el regex anterior a la revisión independiente de la 8.4.
  it("encuentra también las exportadas como constante", () => {
    const text = [
      "export const flecha = async (formData: FormData) => {};",
      "export const tipada: Accion = async (formData) => {};",
      "export const expresion = function () {};",
      "export const unArgumento = (x) => x;",
      "export const noEsFuncion = 1;",
      'export const tampoco = "async () => {}";',
    ].join("\n");

    expect(exportedFunctions(text)).toEqual([
      "flecha",
      "tipada",
      "expresion",
      "unArgumento",
    ]);
  });
});

describe("repositorio", () => {
  const actionModules = APP_FILES.filter(
    (file) => file !== SELF && isServerActionModule(readFileSync(file, "utf8")),
  );

  const found = actionModules.flatMap((file) =>
    exportedFunctions(readFileSync(file, "utf8")).map(
      (name) => `${file}#${name}`,
    ),
  );

  const handlers = APP_FILES.filter((file) => file.endsWith("/route.ts"));

  it("encuentra archivos para revisar", () => {
    expect(actionModules.length).toBeGreaterThan(0);
    expect(handlers.length).toBeGreaterThan(0);
  });

  it("toda Server Action exportada está declarada", () => {
    const undeclared = found.filter((id) => !(id in ACTIONS));

    expect(
      undeclared,
      `Server Actions sin declarar en ${SELF}. Una acción nueva exige decidir si pide sesión ` +
        `y revisar el rol que exige su módulo:\n${undeclared.join("\n")}`,
    ).toEqual([]);
  });

  it("toda Server Action declarada sigue existiendo", () => {
    const missing = Object.keys(ACTIONS).filter((id) => !found.includes(id));

    expect(
      missing,
      `declaradas en ${SELF} y ya inexistentes; la lista miente:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("todo Route Handler está declarado, y al revés", () => {
    expect(handlers.filter((file) => !(file in HANDLERS))).toEqual([]);
    expect(
      Object.keys(HANDLERS).filter((file) => !handlers.includes(file)),
    ).toEqual([]);
  });

  it("lo declarado sin sesión o previo a la sesión dice por qué", () => {
    const silent = Object.entries({ ...ACTIONS, ...HANDLERS })
      .filter(([, entry]) => entry.requirement !== "sesion" && !entry.why)
      .map(([id]) => id);

    expect(
      silent,
      `sin razón escrita; un punto de entrada público sin justificación es un hallazgo:\n${silent.join("\n")}`,
    ).toEqual([]);
  });

  it("las acciones bajo (autenticado) exigen sesión", () => {
    // La agrupación de rutas es la promesa que hace el árbol de carpetas. Si una acción vive ahí
    // y se declara pública, o la declaración está mal o la acción está en el lugar equivocado.
    const wrong = Object.entries(ACTIONS)
      .filter(
        ([id, entry]) =>
          id.includes("(autenticado)") && entry.requirement !== "sesion",
      )
      .map(([id]) => id);

    expect(wrong).toEqual([]);
  });
});
