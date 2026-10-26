import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda del módulo appointments (brief-29.10, D-1 y D-2; ADR 0024, punto 16), con el molde de
// tradeins-dependencies. Tres reglas:
//
// 1. src/modules/appointments/ importa solo de audit, catalog, crm, inventory, knowledge y
//    organizations, los esquemas que nombra schema.ts por sus claves foráneas, src/shared, sus propios
//    archivos y paquetes. De knowledge lee el horario solo con getEffectiveBusinessDays, «la única
//    arista» de D-1, y su tipo; nunca lo escribe;
// 2. ningún módulo importa appointments (D-1), salvo ingestion desde la 29.10.2 (U-1), y solo con
//    requestAppointmentFromIngestion y findAppointmentRequestedByIngestion, como importa el pedido de
//    orders. La regla nombra funciones, así que la guarda lista funciones: otro nombre de appointments en
//    ingestion también falla. Las pantallas y los scripts lo usan, y no cuentan. Un import de
//    appointments en crm o en inventory cerraría un ciclo que ni eslint.config.mjs ni module-boundary
//    ven;
// 3. las tres tablas de appointments se escriben solo desde las funciones de su repositorio, y cada una
//    tiene un llamador fijo: el turno, desde su alta, el pedido del agente (29.10.2) y sus cambios de
//    estado; los valores y los motivos, desde sus casos de uso y la copia del perfil. El vaciado de la
//    nota de un turno lo hace scripts/client-data-delete.ts, fuera de src/, con el rol dueño (D-6).
//
// Lee el texto: import y export con from, el import de efecto y el import dinámico con un literal; las
// escrituras con Drizzle o SQL literal; y las llamadas al repositorio por su espacio de nombres. No ve
// un especificador armado en tiempo de ejecución ni SQL escrito a mano contra la base.

const APPOINTMENTS_ALLOWED = new Set([
  "audit",
  "catalog",
  "crm",
  "inventory",
  "knowledge",
  "organizations",
]);

// Los esquemas que nombra schema.ts por sus claves foráneas. ingestion, desde la 29.10.2: la credencial y
// el evento del turno que pide el agente (D-4).
const SCHEMAS_ALLOWED = new Set([
  "auth",
  "catalog",
  "crm",
  "ingestion",
  "inventory",
  "organizations",
]);

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function specifiers(code: string): string[] {
  return [...code.matchAll(SPECIFIER)].map((match) => match[1]!);
}

function moduleOf(
  specifier: string,
): { name: string; schemaOnly: boolean } | null {
  const match = /^@\/modules\/([^/]+)(\/.*)?$/.exec(specifier);
  if (!match) return null;
  return { name: match[1]!, schemaOnly: match[2] === "/schema" };
}

// Lo único que appointments toma de knowledge (D-1).
const KNOWLEDGE_NAMES = new Set([
  "getEffectiveBusinessDays",
  "EffectiveBusinessDay",
]);

// Los nombres que un archivo toma de un módulo, fuera de una lista: un import entero (`* as`, por
// defecto) también es una violación.
function namedImportViolations(
  file: string,
  code: string,
  module: string,
  allowed: ReadonlySet<string>,
): string[] {
  const pattern = new RegExp(
    String.raw`\b(?:import|export)\s+(?:type\s+)?(\{[^}]*\}|\*(?:\s+as\s+\w+)?|\w+)\s*from\s*["']@/modules/${module}["']`,
    "g",
  );
  return [...code.matchAll(pattern)].flatMap((match) => {
    const clause = match[1]!;
    if (!clause.startsWith("{"))
      return [`${file} importa ${clause} de ${module}`];
    return clause
      .slice(1, -1)
      .split(",")
      .map((name) =>
        name
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]!
          .trim(),
      )
      .filter((name) => name !== "" && !allowed.has(name))
      .map((name) => `${file} importa ${name} de ${module}`);
  });
}

function knowledgeViolations(file: string, code: string): string[] {
  return namedImportViolations(file, code, "knowledge", KNOWLEDGE_NAMES);
}

// Lo único que ingestion toma de appointments (U-1 de la 29.10.2).
const INGESTION_NAMES = new Set([
  "requestAppointmentFromIngestion",
  "findAppointmentRequestedByIngestion",
]);

function appointmentsViolations(file: string, code: string): string[] {
  return knowledgeViolations(file, code).concat(
    appointmentsImportViolations(file, code),
  );
}

function appointmentsImportViolations(file: string, code: string): string[] {
  return specifiers(code)
    .filter((specifier) => {
      const target = moduleOf(specifier);
      if (target === null || target.name === "appointments") return false;
      if (target.schemaOnly) return !SCHEMAS_ALLOWED.has(target.name);
      return !APPOINTMENTS_ALLOWED.has(target.name);
    })
    .map((specifier) => `${file} importa ${specifier}`);
}

function importerViolations(file: string, code: string): string[] {
  const owner = /^src\/modules\/([^/]+)\//.exec(file)?.[1];
  if (!owner || owner === "appointments") return [];
  const imports = specifiers(code).filter(
    (specifier) => moduleOf(specifier)?.name === "appointments",
  );
  if (owner !== "ingestion") {
    return imports.map((specifier) => `${file} importa ${specifier}`);
  }
  // ingestion: solo la interfaz pública, con un import estático de los dos nombres. Un import dinámico,
  // el esquema o cualquier otro nombre fallan.
  const named = [
    ...code.matchAll(
      /\b(?:import|export)\s+(?:type\s+)?\{[^}]*\}\s*from\s*["']@\/modules\/appointments["']/g,
    ),
  ].length;
  return imports
    .filter((specifier) => specifier !== "@/modules/appointments")
    .map((specifier) => `${file} importa ${specifier}`)
    .concat(
      imports.filter((specifier) => specifier === "@/modules/appointments")
        .length > named
        ? [`${file} importa appointments sin nombrar qué`]
        : [],
    )
    .concat(namedImportViolations(file, code, "appointments", INGESTION_NAMES));
}

// Regla 3: las escrituras.

const REPOSITORY = "src/modules/appointments/repository.ts";
const APPOINTMENTS = "src/modules/appointments/appointments.ts";
const SETTINGS = "src/modules/appointments/settings.ts";

const AUTHORIZED = new Map([
  ["insertAppointmentSettings", ["insert appointment_settings"]],
  ["updateAppointmentSettings", ["update appointment_settings"]],
  ["insertReason", ["insert appointment_reasons"]],
  ["updateReason", ["update appointment_reasons"]],
  ["insertAppointment", ["insert appointments"]],
  ["updateAppointmentStatus", ["update appointments"]],
]);

const TABLES = new Map([
  ["appointmentsettings", "appointment_settings"],
  ["appointment_settings", "appointment_settings"],
  ["appointmentreasons", "appointment_reasons"],
  ["appointment_reasons", "appointment_reasons"],
  ["appointments", "appointments"],
]);

const SQL_TABLE = String.raw`(?:"?public"?\s*\.\s*)?"?(appointment_settings|appointment_reasons|appointments)"?\b|\$\{\s*(?:\w+\.)?(appointmentSettings|appointmentReasons|appointments)\s*\}`;

const WRITE_PATTERNS = [
  /\.(insert|update|delete)\(\s*(?:\w+\.)?(appointmentSettings|appointmentReasons|appointments)\s*\)/g,
  new RegExp(
    String.raw`\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)(?:\s+only)?\s+(?:${SQL_TABLE})`,
    "gi",
  ),
];

const FUNCTION_PATTERN =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?^\}/gm;

function functionsOf(code: string) {
  return [...code.matchAll(FUNCTION_PATTERN)].map((match) => ({
    name: match[1]!,
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function enclosing(
  functions: ReturnType<typeof functionsOf>,
  index: number,
): string | null {
  return functions.find((f) => index >= f.start && index < f.end)?.name ?? null;
}

function findWrites(code: string) {
  const functions = functionsOf(code);
  return WRITE_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => ({
      line: code.slice(0, match.index).split("\n").length,
      operation: `${match[1]!.toLowerCase().split(/\s+/)[0]} ${TABLES.get((match[2] ?? match[3])!.toLowerCase())}`,
      fn: enclosing(functions, match.index),
    })),
  ).sort((a, b) => a.line - b.line);
}

function writeViolations(file: string, code: string): string[] {
  return findWrites(code)
    .filter(
      ({ operation, fn }) =>
        !(
          file === REPOSITORY &&
          fn !== null &&
          AUTHORIZED.get(fn)?.includes(operation)
        ),
    )
    .map(({ line, operation }) => `${file}:${line} ${operation}`);
}

// Los llamadores de cada escritura del repositorio, por su espacio de nombres.
const CALLERS = new Map<string, { file: string; from: string[] }[]>([
  [
    "insertAppointmentSettings",
    [{ file: SETTINGS, from: ["writeSettings", "applyAppointmentsTemplate"] }],
  ],
  ["updateAppointmentSettings", [{ file: SETTINGS, from: ["writeSettings"] }]],
  [
    "insertReason",
    [
      {
        file: SETTINGS,
        from: ["createAppointmentReason", "applyAppointmentsTemplate"],
      },
    ],
  ],
  [
    "updateReason",
    [
      {
        file: SETTINGS,
        from: [
          "renameAppointmentReason",
          "setAppointmentReasonActive",
          "moveAppointmentReason",
        ],
      },
    ],
  ],
  [
    "insertAppointment",
    [
      {
        file: APPOINTMENTS,
        from: ["createAppointment", "requestAppointmentFromIngestion"],
      },
    ],
  ],
  [
    "updateAppointmentStatus",
    [{ file: APPOINTMENTS, from: ["changeAppointmentStatus"] }],
  ],
]);

const CALL_PATTERN = new RegExp(
  String.raw`\brepository\.(${[...CALLERS.keys()].join("|")})\s*\(`,
  "g",
);

function callViolations(file: string, code: string): string[] {
  const functions = functionsOf(code);
  return [...code.matchAll(CALL_PATTERN)].flatMap((match) => {
    const callee = match[1]!;
    const fn = enclosing(functions, match.index);
    const line = code.slice(0, match.index).split("\n").length;
    return CALLERS.get(callee)!.some(
      (rule) => rule.file === file && fn !== null && rule.from.includes(fn),
    )
      ? []
      : [`${file}:${line} ${callee} desde ${fn ?? "fuera de una función"}`];
  });
}

describe("detección", () => {
  it.each([
    ["sales", 'import { issueSale } from "@/modules/sales";'],
    ["service", 'import { listRepairTypes } from "@/modules/service";'],
    [
      "service por su esquema",
      'import { serviceOrders } from "@/modules/service/schema";',
    ],
    [
      "knowledge por su esquema",
      'import { businessHours } from "@/modules/knowledge/schema";',
    ],
    [
      "orders con un import dinámico",
      'const o = await import("@/modules/orders");',
    ],
    [
      "cash con un re-export",
      'export { openCashSession } from "@/modules/cash";',
    ],
    [
      "otra lectura de knowledge",
      'import {\n  getBusinessHoursForService,\n  getEffectiveBusinessDays,\n} from "@/modules/knowledge";',
    ],
    ["knowledge entero", 'import * as knowledge from "@/modules/knowledge";'],
    // De ingestion, solo el esquema (brief-29.10.2, D-5): la interfaz es una condición de detención.
    [
      "ingestion más allá de su esquema",
      'import { recordIngestionEventV2 } from "@/modules/ingestion";',
    ],
  ])("regla 1, detecta que appointments importe %s", (_name, code) => {
    expect(
      appointmentsViolations("src/modules/appointments/appointments.ts", code),
    ).not.toEqual([]);
  });

  it("regla 1, permite su lista, los esquemas de sus claves, src/shared, lo propio y paquetes", () => {
    const code = [
      'import { recordAudit } from "@/modules/audit";',
      'import { users } from "@/modules/auth/schema";',
      'import { getProductsByIds } from "@/modules/catalog";',
      'import { products } from "@/modules/catalog/schema";',
      'import { lockClientForOrder } from "@/modules/crm";',
      'import { clients } from "@/modules/crm/schema";',
      'import { getUnitSummaries } from "@/modules/inventory";',
      'import { stockUnits } from "@/modules/inventory/schema";',
      'import { ingestionEvents } from "@/modules/ingestion/schema";',
      'import {\n  getEffectiveBusinessDays,\n  type EffectiveBusinessDay,\n} from "@/modules/knowledge";',
      'import { authorize } from "@/modules/organizations";',
      'import { failure } from "@/shared/errors";',
      'import * as repository from "./repository";',
      'import { z } from "zod";',
    ].join("\n");
    expect(
      appointmentsViolations("src/modules/appointments/x.ts", code),
    ).toEqual([]);
  });

  it.each([
    ["crm", 'import { listClientAppointments } from "@/modules/appointments";'],
    [
      "knowledge",
      'import { appointments } from "@/modules/appointments/schema";',
    ],
    ["inventory", 'const a = await import("@/modules/appointments");'],
  ])("regla 2, detecta que %s importe appointments", (owner, code) => {
    expect(
      importerViolations(`src/modules/${owner}/service.ts`, code),
    ).not.toEqual([]);
  });

  // Dentro del grano de U-1: ingestion puede importar appointments, pero solo dos nombres.
  it.each([
    [
      "otro nombre",
      'import {\n  findAppointmentRequestedByIngestion,\n  createAppointment,\n} from "@/modules/appointments";',
    ],
    [
      "el módulo entero",
      'import * as appointments from "@/modules/appointments";',
    ],
    [
      "el esquema",
      'import { appointments } from "@/modules/appointments/schema";',
    ],
    ["un import dinámico", 'const a = await import("@/modules/appointments");'],
    [
      "un re-export de otro nombre",
      'export { listFreeSlotsForService } from "@/modules/appointments";',
    ],
  ])(
    "regla 2, detecta que ingestion importe de appointments %s",
    (_name, code) => {
      expect(
        importerViolations("src/modules/ingestion/service.ts", code),
      ).not.toEqual([]);
    },
  );

  it("regla 2, permite a ingestion sus dos nombres", () => {
    expect(
      importerViolations(
        "src/modules/ingestion/service.ts",
        'import {\n  findAppointmentRequestedByIngestion,\n  requestAppointmentFromIngestion,\n} from "@/modules/appointments";',
      ),
    ).toEqual([]);
  });

  it("regla 2, permite las pantallas", () => {
    expect(
      importerViolations(
        "src/app/(autenticado)/turnos/page.tsx",
        'import { getAppointmentCalendar } from "@/modules/appointments";',
      ),
    ).toEqual([]);
  });

  it.each([
    {
      name: "insert de un turno fuera de la función autorizada",
      file: REPOSITORY,
      code: "export async function other(tx) {\n  await tx.insert(appointments).values(v);\n}",
    },
    {
      name: "update de un turno desde el alta",
      file: REPOSITORY,
      code: "export async function insertAppointment(tx) {\n  await tx.update(appointments).set(v);\n}",
    },
    {
      name: "SQL literal sobre los motivos desde otro módulo",
      file: "src/modules/crm/service.ts",
      code: "await tx.execute(sql`update appointment_reasons set name = 'x'`);",
    },
    {
      name: "delete de un turno con la tabla interpolada",
      file: APPOINTMENTS,
      code: "await tx.execute(sql`delete from ${appointments}`);",
    },
  ])("regla 3, detecta: $name", ({ file, code }) => {
    expect(writeViolations(file, code)).not.toEqual([]);
  });

  it.each([
    {
      name: "un cambio de estado desde el alta",
      file: APPOINTMENTS,
      code: "export async function createAppointment(c) {\n  await repository.updateAppointmentStatus(tx, o, i, s);\n}",
    },
    {
      name: "un turno escrito desde una pantalla",
      file: "src/app/(autenticado)/turnos/actions.ts",
      code: "export async function createAction() {\n  await repository.insertAppointment(tx, o, v);\n}",
    },
  ])("regla 3, detecta el llamador: $name", ({ file, code }) => {
    expect(callViolations(file, code)).not.toEqual([]);
  });
});

describe("el código", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((file) => join("src", file).replaceAll("\\", "/"))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

  it("appointments importa solo de su lista", () => {
    const own = files.filter((file) =>
      file.startsWith("src/modules/appointments/"),
    );
    expect(own.length).toBeGreaterThan(0);
    expect(
      own.flatMap((file) =>
        appointmentsViolations(file, readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
  });

  it("ningún módulo importa appointments, salvo ingestion con sus dos nombres", () => {
    expect(
      files.flatMap((file) =>
        importerViolations(file, readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
  });

  it("ningún archivo de src/ escribe las tablas de appointments fuera de las funciones autorizadas", () => {
    const violations = files.flatMap((file) =>
      writeViolations(file, readFileSync(file, "utf8")),
    );
    expect(
      violations,
      `Escrituras no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  // Si el repositorio cambiara de patrón, la guarda quedaría vacía y seguiría en verde.
  it("el repositorio tiene exactamente las escrituras autorizadas", () => {
    expect(
      findWrites(readFileSync(REPOSITORY, "utf8")).map(
        ({ operation, fn }) => `${fn}: ${operation}`,
      ),
    ).toEqual([
      "insertAppointmentSettings: insert appointment_settings",
      "updateAppointmentSettings: update appointment_settings",
      "insertReason: insert appointment_reasons",
      "updateReason: update appointment_reasons",
      "insertAppointment: insert appointments",
      "updateAppointmentStatus: update appointments",
    ]);
  });

  it("cada escritura se llama solo desde su llamador, y cada una tiene su llamada", () => {
    const violations = files.flatMap((file) =>
      callViolations(file, readFileSync(file, "utf8")),
    );
    expect(
      violations,
      `Llamadas no autorizadas:\n${violations.join("\n")}`,
    ).toEqual([]);
    const called = new Set(
      files.flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(CALL_PATTERN)].map(
          (match) => match[1]!,
        ),
      ),
    );
    expect([...CALLERS.keys()].filter((name) => !called.has(name))).toEqual([]);
  });
});
