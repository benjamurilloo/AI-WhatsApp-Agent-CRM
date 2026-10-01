import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de la retención del journal de producción (brief-13.4, D-6 y AC-10).
//
// Lo que protege: que una entrada del journal, que guarda identificadores de organización y de
// usuario, no viva más de 31 días. journald borra archivos enteros, así que el límite real es
// MaxRetentionSec más MaxFileSec, y los dos se comprueban.
//
// **Parsea con la semántica de journald, no busca texto** (nota del vault «A Detector Sees One
// Syntactic Form Until a Mutation Proves Otherwise»):
//   - una clave fuera de [Journal] no rige, y journald la ignora;
//   - la última asignación gana, y una asignación vacía vuelve al valor por defecto;
//   - los tiempos llevan las unidades de systemd.time(7), donde «1month» son 30,44 días;
//   - lo que la guarda no entiende, lo rechaza: una sección, una clave o una unidad desconocidas.
//
// Límite declarado: lee el archivo versionado. Que el servidor lo tenga, y que ningún otro archivo
// de /etc/systemd/journald.conf.d/ lo pise, se verifica en el droplet con
// `systemd-analyze cat-config systemd/journald.conf` (deploy/production/README.md).

const ARCHIVO = "deploy/production/journald-crm-production.conf";

const DIA = 24 * 60 * 60;
const MAXIMO_SEGUNDOS = 31 * DIA;

// systemd.time(7). Un mes son 30,44 días y un año, 365,25.
const UNIDADES: Record<string, number> = {
  us: 1e-6,
  usec: 1e-6,
  ms: 1e-3,
  msec: 1e-3,
  s: 1,
  sec: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hour: 3600,
  hours: 3600,
  d: DIA,
  day: DIA,
  days: DIA,
  w: 7 * DIA,
  week: 7 * DIA,
  weeks: 7 * DIA,
  M: 30.44 * DIA,
  month: 30.44 * DIA,
  months: 30.44 * DIA,
  y: 365.25 * DIA,
  year: 365.25 * DIA,
  years: 365.25 * DIA,
};

/** Segundos de un tiempo de systemd. Sin unidad son segundos. Lanza ante lo que no entiende. */
export function segundos(valor: string): number {
  const texto = valor.trim();
  if (texto === "") throw new Error("tiempo vacío");
  let total = 0;
  let resto = texto;
  while (resto !== "") {
    const parte = /^(\d+(?:\.\d+)?)\s*([A-Za-z]*)\s*/.exec(resto);
    if (!parte) throw new Error(`tiempo ilegible: ${valor}`);
    const unidad = parte[2] ?? "";
    const factor = unidad === "" ? 1 : UNIDADES[unidad];
    if (factor === undefined) throw new Error(`unidad desconocida: ${unidad}`);
    total += Number(parte[1]) * factor;
    resto = resto.slice(parte[0].length);
  }
  return total;
}

const CLAVES = ["MaxRetentionSec", "MaxFileSec", "SystemMaxUse"] as const;
type Clave = (typeof CLAVES)[number];

/** Valores efectivos de [Journal]. Una asignación vacía borra el valor, como en journald. */
export function journal(texto: string): Partial<Record<Clave, string>> {
  const efectivos: Partial<Record<Clave, string>> = {};
  let seccion: string | null = null;
  for (const [indice, cruda] of texto.split(/\r?\n/).entries()) {
    const linea = cruda.trim();
    if (linea === "" || linea.startsWith("#") || linea.startsWith(";"))
      continue;
    const encabezado = /^\[(.+)\]$/.exec(linea);
    if (encabezado) {
      seccion = encabezado[1]!;
      if (seccion !== "Journal")
        throw new Error(
          `línea ${indice + 1}: sección desconocida [${seccion}]`,
        );
      continue;
    }
    const asignacion = /^([A-Za-z]+)\s*=\s*(.*)$/.exec(linea);
    if (!asignacion)
      throw new Error(`línea ${indice + 1}: no se entiende: ${linea}`);
    if (seccion !== "Journal")
      throw new Error(`línea ${indice + 1}: clave fuera de [Journal]`);
    const clave = asignacion[1]!;
    if (!(CLAVES as readonly string[]).includes(clave))
      throw new Error(`línea ${indice + 1}: clave no prevista: ${clave}`);
    const valor = asignacion[2]!.trim();
    if (valor === "") delete efectivos[clave as Clave];
    else efectivos[clave as Clave] = valor;
  }
  return efectivos;
}

/** Problemas de la retención. Vacío si una entrada no puede vivir más de 31 días. */
export function problemasDeRetencion(texto: string): string[] {
  let valores: Partial<Record<Clave, string>>;
  try {
    valores = journal(texto);
  } catch (error) {
    return [(error as Error).message];
  }
  const problemas: string[] = [];
  const tiempo = (clave: "MaxRetentionSec" | "MaxFileSec"): number | null => {
    const valor = valores[clave];
    if (valor === undefined) {
      problemas.push(`falta ${clave}: rige el valor por defecto`);
      return null;
    }
    try {
      const s = segundos(valor);
      // 0 desactiva el límite en journald.
      if (s <= 0) problemas.push(`${clave}=${valor} desactiva el límite`);
      return s;
    } catch (error) {
      problemas.push(`${clave}: ${(error as Error).message}`);
      return null;
    }
  };
  const retencion = tiempo("MaxRetentionSec");
  const archivo = tiempo("MaxFileSec");
  if (
    retencion !== null &&
    archivo !== null &&
    retencion > 0 &&
    archivo > 0 &&
    retencion + archivo > MAXIMO_SEGUNDOS
  ) {
    problemas.push(
      `una entrada puede vivir ${((retencion + archivo) / DIA).toFixed(2)} días, más de 31`,
    );
  }
  if (valores.SystemMaxUse === undefined)
    problemas.push("falta SystemMaxUse: el tamaño no tiene tope propio");
  return problemas;
}

const REAL = readFileSync(ARCHIVO, "utf8");

describe("producción: el journal se conserva 30 días como mucho", () => {
  it("el archivo versionado no tiene problemas", () => {
    expect(problemasDeRetencion(REAL)).toEqual([]);
  });

  it("lee los valores del archivo real", () => {
    expect(journal(REAL)).toEqual({
      MaxRetentionSec: "30day",
      MaxFileSec: "1day",
      SystemMaxUse: "1G",
    });
  });
});

// Mutaciones sobre el archivo real: cada una tiene que dar al menos un problema.
describe("la guarda detecta cada forma de romper la retención", () => {
  const casos: [string, string][] = [
    ["un mes, que son 30,44 días", REAL.replace("30day", "1month")],
    ["la retención en 0, que la desactiva", REAL.replace("30day", "0")],
    [
      "la retención sin unidad, en segundos de más",
      REAL.replace("30day", "2678400"),
    ],
    [
      "el archivo por mes, como el valor por defecto",
      REAL.replace("MaxFileSec=1day", "MaxFileSec=1month"),
    ],
    ["sin MaxFileSec", REAL.replace("MaxFileSec=1day\n", "")],
    [
      "una asignación vacía al final, que vuelve al defecto",
      `${REAL}MaxRetentionSec=\n`,
    ],
    ["una asignación posterior más larga", `${REAL}MaxRetentionSec=60d\n`],
    ["las claves fuera de [Journal]", REAL.replace("[Journal]\n", "")],
    ["otra sección", REAL.replace("[Journal]", "[Jornal]")],
    ["una unidad desconocida", REAL.replace("30day", "30dias")],
    ["una clave no prevista", `${REAL}Storage=volatile\n`],
    ["sin tope de tamaño", REAL.replace("SystemMaxUse=1G\n", "")],
  ];

  for (const [nombre, texto] of casos) {
    it(`detecta ${nombre}`, () => {
      expect(texto).not.toBe(REAL);
      expect(problemasDeRetencion(texto)).not.toEqual([]);
    });
  }

  it("acepta formas equivalentes a la real", () => {
    for (const valor of ["30d", "30 days", "4w 2d", "720h", "29d 23h"]) {
      expect(problemasDeRetencion(REAL.replace("30day", valor)), valor).toEqual(
        [],
      );
    }
  });
});
