import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de la configuración de backup de staging (brief-9.2).
//
// Por qué existe: un backup roto **no avisa**. La base sigue andando, el timer sigue
// en verde y el archivo sigue apareciendo; lo único que cambia es que el día que haga
// falta no va a servir. No hay síntoma hasta la emergencia, así que la única defensa
// posible es fijar la configuración y detectar su regresión.
//
// **Las unidades de `systemd` se parsean, no se grepean.** La 9.1 aprendió por qué: su
// primera guarda del proxy comprobaba presencia de subcadenas sobre el archivo entero y
// dejaba pasar en verde dos regresiones plausibles (N-1). Un archivo INI tiene secciones
// y claves, y una clave puesta en la sección equivocada no hace nada — que es justo la
// regresión que una búsqueda de texto no distingue de la configuración correcta.
//
// **Y la rotación se simula, no se grepea.** La primera versión de esta guarda sí
// grepeaba: comprobaba que existiera la subcadena `head -n "-$BACKUP_KEEP"`. La revisión
// independiente de la 9.2 midió que cambiar `sort` por `sort -r` —cinco caracteres, la
// subcadena intacta— invierte la rotación para que **borre las copias más nuevas**, y
// los 20 casos seguían en verde, incluido el que se llamaba «la rotación conserva las
// más nuevas». Fue la quinta aparición de este patrón en el proyecto y la primera en un
// instrumento escrito el mismo día que la regla que lo prohíbe. Abajo, la tubería real
// del script se extrae, se interpreta y se ejecuta sobre nombres sintéticos: lo que se
// afirma es **qué archivos sobrevivirían**, no cómo está escrito el comando.
//
// Lo que NO comprueba, declarado para no confundirlo con cobertura:
//   - **Que el servidor tenga estos archivos.** Igual que la guarda del proxy: nadie lee
//     la máquina desde un test. La comparación es un paso manual del runbook.
//   - **Que el backup funcione.** Eso no lo puede decir ningún test de este repositorio;
//     lo dice el ejercicio de restauración, que corre en el servidor y deja su evidencia.
//   - **El resto de la lógica de los scripts.** El simulador conoce tres órdenes
//     (`find`, `sort`, `head`/`tail`) y **falla ante cualquier otra**: si la rotación
//     cambia de herramienta, el test se pone rojo hasta que el simulador la aprenda. Es
//     deliberado — un simulador que ignora lo que no entiende vuelve al problema de
//     origen.

type Unidad = Map<string, Map<string, string[]>>;

/**
 * Parsea un archivo de unidad de `systemd`. Devuelve sección → clave → valores, en
 * orden. Las claves se acumulan en una lista porque en systemd repetir una clave
 * **agrega** para las de tipo lista y **reemplaza** para las escalares; la guarda no
 * adivina cuál es cuál, expone las dos y cada caso decide.
 */
export function parsearUnidad(texto: string): Unidad {
  const unidad: Unidad = new Map();
  let seccion = "";

  // systemd permite partir un valor largo en varias líneas terminándolas en `\`, y es
  // la forma habitual de escribir un `ExecStart` o un `ReadWritePaths` con muchos
  // elementos. Sin unirlas, la guarda leería `ReadWritePaths=/a \` y no encontraría
  // `/var/backups/crm-staging` en la línea siguiente: daría rojo sobre una unidad
  // perfectamente válida. La revisión de la 9.2 lo señaló (R-21) sobre un parser que no
  // lo modelaba; no había unidad que lo usara todavía, que es justo cuando conviene.
  // Solo espacios y tabuladores alrededor, nunca `\s`: un `\s*` final se comería una
  // línea en blanco y con ella la clave siguiente, que es peor que no unir nada.
  const unido = texto.replace(/[ \t]*\\\r?\n[ \t]*/g, " ");

  for (const cruda of unido.split("\n")) {
    const linea = cruda.trim();
    if (!linea || linea.startsWith("#") || linea.startsWith(";")) continue;

    if (linea.startsWith("[") && linea.endsWith("]")) {
      seccion = linea.slice(1, -1);
      if (!unidad.has(seccion)) unidad.set(seccion, new Map());
      continue;
    }

    const igual = linea.indexOf("=");
    if (igual === -1 || !seccion) continue;

    const clave = linea.slice(0, igual).trim();
    const valor = linea.slice(igual + 1).trim();
    const claves = unidad.get(seccion) ?? new Map<string, string[]>();
    claves.set(clave, [...(claves.get(clave) ?? []), valor]);
    unidad.set(seccion, claves);
  }

  return unidad;
}

/** Último valor de una clave en una sección, o `null` si no está en esa sección. */
export function valor(
  unidad: Unidad,
  seccion: string,
  clave: string,
): string | null {
  return unidad.get(seccion)?.get(clave)?.at(-1) ?? null;
}

/**
 * Todos los valores de una clave de tipo lista, como `OnSuccess=`. systemd los acumula:
 * dos líneas o una línea con dos unidades separadas por espacio valen lo mismo. Y una
 * asignación vacía **vacía la lista**: después de `OnSuccess=` solo cuenta lo que venga
 * debajo (revisión independiente de la 13.3, hallazgo 5b).
 */
export function valores(
  unidad: Unidad,
  seccion: string,
  clave: string,
): string[] {
  let lista: string[] = [];
  for (const v of unidad.get(seccion)?.get(clave) ?? []) {
    lista = v === "" ? [] : [...lista, ...v.split(/\s+/).filter(Boolean)];
  }
  return lista;
}

/**
 * ¿La expresión `OnCalendar` dispara todos los días? Solo mira la parte de fecha: un
 * `*-*-01` es un archivo válido, systemd no se queja, el timer queda en verde y el
 * backup pasa de diario a mensual. D-3 dice diario.
 */
export function esDiario(onCalendar: string): boolean {
  const campos = onCalendar.trim().split(/\s+/);
  // Con día de la semana delante (`Mon *-*-* ...`) tampoco es diario, y ese caso cae
  // acá porque el primer campo deja de ser la fecha.
  return campos.length >= 2 && campos[0] === "*-*-*";
}

/**
 * ¿La expresión `OnCalendar` dispara una vez por mes? La falla que importa es la
 * simétrica de la anterior: un `*-*-*` en el ejercicio de restauración lo convierte en
 * diario, crea y borra una base entera todos los días, y nadie lo nota hasta que el
 * disco o el journal se quejan.
 */
export function esMensual(onCalendar: string): boolean {
  const campos = onCalendar.trim().split(/\s+/);
  return campos.length >= 2 && /^\*-\*-\d{2}$/.test(campos[0] ?? "");
}

// --- Simulador de la tubería de rotación --------------------------------------------

/**
 * Extrae el cuerpo de una asignación `variable=$( ... )` del script, uniendo las
 * continuaciones de línea. Si no está, falla: la guarda no puede quedarse callada
 * porque la rotación haya cambiado de forma.
 */
export function extraerAsignacion(texto: string, variable: string): string {
  const marca = `${variable}=$(`;
  const inicio = texto.indexOf(marca);
  if (inicio === -1) {
    throw new Error(`no hay ninguna asignación ${marca}...) en el script`);
  }

  let profundidad = 1;
  let comilla: string | null = null;
  let cuerpo = "";

  for (let i = inicio + marca.length; i < texto.length; i++) {
    const c = texto[i];
    if (comilla) {
      if (c === comilla) comilla = null;
    } else if (c === '"' || c === "'") {
      comilla = c;
    } else if (c === "(") {
      profundidad++;
    } else if (c === ")") {
      profundidad--;
      if (profundidad === 0) return cuerpo.replace(/\\\n/g, " ");
    }
    cuerpo += c;
  }

  throw new Error(`la asignación ${variable}=$(...) no cierra`);
}

/** Parte una tubería en etapas, sin cortar dentro de comillas. */
export function etapasDe(cuerpo: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let comilla: string | null = null;

  for (const c of cuerpo) {
    if (comilla) {
      actual += c;
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'") {
      comilla = c;
      actual += c;
      continue;
    }
    if (c === "|") {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  partes.push(actual);

  return partes.map((parte) => {
    const etapa = parte.trim();
    if (!etapa) {
      throw new Error("etapa vacía en la tubería: ¿un || donde iba un |?");
    }
    return etapa;
  });
}

/** Trocea una etapa en argumentos, quitando las comillas. */
export function aArgv(etapa: string): string[] {
  const argv: string[] = [];
  let actual = "";
  let hubo = false;
  let comilla: string | null = null;

  for (const c of etapa) {
    if (comilla) {
      if (c === comilla) comilla = null;
      else actual += c;
      continue;
    }
    if (c === '"' || c === "'") {
      comilla = c;
      hubo = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (hubo || actual) argv.push(actual);
      actual = "";
      hubo = false;
      continue;
    }
    actual += c;
  }
  if (hubo || actual) argv.push(actual);

  return argv;
}

function expandir(token: string, entorno: Record<string, string>): string {
  return token.replace(/\$\{(\w+)\}|\$(\w+)/g, (_crudo, llave, plano) => {
    const nombre: string = llave ?? plano;
    if (!(nombre in entorno)) {
      throw new Error(
        `la tubería usa $${nombre}, que el simulador no tiene definida`,
      );
    }
    return entorno[nombre] as string;
  });
}

function ordenar(lineas: string[], banderas: string[]): string[] {
  let reverso = false;
  for (const bandera of banderas) {
    if (bandera === "-r" || bandera === "--reverse") {
      reverso = true;
      continue;
    }
    throw new Error(
      `sort ${bandera} no está modelado: el simulador no puede opinar`,
    );
  }
  const ordenadas = [...lineas].sort();
  return reverso ? ordenadas.reverse() : ordenadas;
}

function cuantas(banderas: string[], orden: string): string {
  let n: string | null = null;

  for (let i = 0; i < banderas.length; i++) {
    const bandera = banderas[i] ?? "";
    if (bandera === "-n") {
      n = banderas[++i] ?? "";
      continue;
    }
    if (/^-n./.test(bandera)) {
      n = bandera.slice(2);
      continue;
    }
    if (/^-\d+$/.test(bandera)) {
      n = bandera.slice(1);
      continue;
    }
    throw new Error(`${orden} ${bandera} no está modelado`);
  }

  if (n === null) {
    throw new Error(`${orden} sin -n: el tope queda implícito en 10 líneas`);
  }
  return n;
}

/**
 * Interpreta la tubería sobre una lista de nombres y devuelve lo que saldría por la
 * otra punta. Ante una orden que no conoce **falla**, en vez de dejarla pasar.
 */
export function simular(
  cuerpo: string,
  entrada: string[],
  entorno: Record<string, string>,
): string[] {
  let lineas = [...entrada];

  etapasDe(cuerpo).forEach((etapa, indice) => {
    const argv = aArgv(etapa).map((token) => expandir(token, entorno));
    const orden = argv[0];

    if (indice === 0) {
      if (orden !== "find") {
        throw new Error(`la tubería empieza con '${orden}', no con find`);
      }
      // `find` no ordena: entrega los archivos en el orden del directorio, que no está
      // garantizado. Por eso abajo la entrada se le pasa desordenada a propósito.
      return;
    }

    switch (orden) {
      case "sort":
        lineas = ordenar(lineas, argv.slice(1));
        return;

      case "head": {
        const n = cuantas(argv.slice(1), "head");
        if (n.startsWith("-")) {
          const k = Number(n.slice(1));
          lineas =
            k === 0 ? lineas : lineas.slice(0, Math.max(0, lineas.length - k));
          return;
        }
        lineas = lineas.slice(0, Number(n));
        return;
      }

      case "tail": {
        const n = cuantas(argv.slice(1), "tail");
        if (n.startsWith("+")) {
          lineas = lineas.slice(Number(n.slice(1)) - 1);
          return;
        }
        const k = Number(n.replace(/^-/, ""));
        lineas = k === 0 ? [] : lineas.slice(Math.max(0, lineas.length - k));
        return;
      }

      default:
        throw new Error(
          `el simulador no conoce '${orden}'. Si la rotación cambió de herramienta, ` +
            `el simulador tiene que aprenderla antes de que el cambio cuente como cubierto.`,
        );
    }
  });

  return lineas;
}

// Los dos entornos con backup (brief-13.1, D-12). Todo lo de abajo corre sobre cada uno; lo que
// solo tiene producción —el cifrado y la copia externa— va en su propio bloque al final.
const ENTORNOS_BACKUP = [
  { nombre: "staging", directorio: "deploy/staging", base: "crm_staging" },
  {
    nombre: "production",
    directorio: "deploy/production",
    base: "crm_production",
  },
] as const;

// Esta guarda tiene su propia lista, así que la cobertura de `deploy/` se comprueba acá contra
// ella, no contra la de la guarda del proxy. Hasta la revisión independiente de la 13.1 solo la
// del proxy lo hacía, y un entorno agregado solo a su lista quedaba sin guarda de backup.
/** Directorios de `deploy/` que ninguna entrada de ENTORNOS_BACKUP cubre. */
export function directoriosSinBackup(directorios: readonly string[]): string[] {
  const cubiertos = new Set<string>(ENTORNOS_BACKUP.map((e) => e.directorio));
  return directorios
    .map((nombre) => `deploy/${nombre}`)
    .filter((directorio) => !cubiertos.has(directorio));
}

describe("todo directorio de deploy/ tiene su guarda de backup", () => {
  const presentes = readdirSync("deploy", { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name);

  it("no hay ningún directorio de despliegue sin su entorno en ENTORNOS_BACKUP", () => {
    expect(directoriosSinBackup(presentes)).toEqual([]);
  });

  it("un directorio nuevo sin guarda de backup se detecta", () => {
    expect(directoriosSinBackup([...presentes, "demo"])).toEqual([
      "deploy/demo",
    ]);
  });
});

/**
 * El script sin sus comentarios. Hace falta para afirmar que algo NO está: los dos
 * scripts explican en prosa las trampas que evitan, así que buscar `--no-owner` sobre
 * el texto entero encuentra el comentario que dice que no hay que usarlo.
 */
export function codigoDe(script: string): string {
  return script
    .split("\n")
    .filter((linea) => !linea.trim().startsWith("#"))
    .join("\n");
}

describe.each(ENTORNOS_BACKUP)("$nombre", (entorno) => {
  const leer = (archivo: string) =>
    readFileSync(`${entorno.directorio}/${archivo}`, "utf8");
  const SERVICIO = parsearUnidad(leer("crm-backup.service"));
  const TIMER = parsearUnidad(leer("crm-backup.timer"));
  const EJERCICIO = parsearUnidad(leer("crm-restore-check.service"));
  const EJERCICIO_TIMER = parsearUnidad(leer("crm-restore-check.timer"));
  const BACKUP = leer("crm-backup.sh");
  const RESTORE = leer("crm-restore-check.sh");

  describe("el parser de unidades distingue sección y clave", () => {
    // Los casos de abajo son los que le dan sentido a parsear en vez de grepear. Sin
    // ellos, la guarda entera podría estar haciendo `texto.includes(...)` y pasaría igual.

    it("no confunde una clave puesta en la sección equivocada", () => {
      const mal = parsearUnidad("[Unit]\nWantedBy=timers.target\n[Install]\n");
      expect(valor(mal, "Install", "WantedBy")).toBeNull();
      expect(valor(mal, "Unit", "WantedBy")).toBe("timers.target");
    });

    it("ignora los comentarios, que no son configuración activa", () => {
      const comentada = parsearUnidad("[Timer]\n# Persistent=true\n");
      expect(valor(comentada, "Timer", "Persistent")).toBeNull();
    });

    it("se queda con la última de una clave repetida", () => {
      const repetida = parsearUnidad(
        "[Timer]\nPersistent=true\nPersistent=false\n",
      );
      expect(valor(repetida, "Timer", "Persistent")).toBe("false");
    });

    it("no inventa secciones que no existen", () => {
      expect(valor(SERVICIO, "Timer", "OnCalendar")).toBeNull();
    });

    it("une las continuaciones de línea de systemd", () => {
      // Sin esto, una unidad válida escrita en varias líneas daría rojo: la guarda leería
      // el valor cortado y no encontraría lo que busca. Es un falso negativo del detector,
      // no del archivo (R-21 de la revisión de la 9.2).
      const partida = parsearUnidad(
        "[Service]\nReadWritePaths=/var/log \\\n  /var/backups/crm-staging\n",
      );
      expect(valor(partida, "Service", "ReadWritePaths")).toBe(
        "/var/log /var/backups/crm-staging",
      );
    });

    it("una continuación no se traga la clave siguiente", () => {
      // El control del anterior: si el `\` uniera de más, `Type` desaparecería.
      const dos = parsearUnidad(
        "[Service]\nExecStart=/bin/a \\\n  --x\nType=oneshot\n",
      );
      expect(valor(dos, "Service", "ExecStart")).toBe("/bin/a --x");
      expect(valor(dos, "Service", "Type")).toBe("oneshot");
    });
  });

  describe("el timer versionado", () => {
    // Estas regresiones son silenciosas. Ninguna hace fallar nada al desplegar: el archivo
    // sigue siendo válido y `systemctl` no se queja. Lo único que cambia es que deja de
    // haber backups, y eso no se nota hasta que hace falta uno.

    it("se instala: sin [Install] WantedBy, un timer habilitado nunca arranca", () => {
      expect(valor(TIMER, "Install", "WantedBy")).toBe("timers.target");
    });

    it("dispara todos los días, no un día del mes (D-3)", () => {
      const calendario = valor(TIMER, "Timer", "OnCalendar");
      expect(calendario).not.toBeNull();
      expect(esDiario(calendario as string)).toBe(true);
      expect(calendario).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it("`esDiario` distingue lo diario de lo que solo lo parece", () => {
      // Mutación ejecutada en la revisión: `*-*-*` → `*-*-01` convierte el backup diario
      // en mensual y pasaba los 20 casos de la versión anterior de esta guarda.
      expect(esDiario("*-*-* 03:15:00 UTC")).toBe(true);
      expect(esDiario("*-*-01 03:15:00 UTC")).toBe(false);
      expect(esDiario("*-01-* 03:15:00 UTC")).toBe(false);
      expect(esDiario("Mon *-*-* 03:15:00 UTC")).toBe(false);
    });

    it("es Persistent: si la máquina estuvo apagada a esa hora, el backup se recupera", () => {
      expect(valor(TIMER, "Timer", "Persistent")).toBe("true");
    });

    it("dispara el servicio de backup y no otra cosa", () => {
      expect(valor(TIMER, "Timer", "Unit")).toBe("crm-backup.service");
    });
  });

  describe("el servicio versionado", () => {
    it("es oneshot: un backup termina, no se queda corriendo", () => {
      expect(valor(SERVICIO, "Service", "Type")).toBe("oneshot");
    });

    it("ejecuta el script de backup", () => {
      expect(valor(SERVICIO, "Service", "ExecStart")).toContain(
        "crm-backup.sh",
      );
    });

    it("puede escribir en el directorio de copias, que ProtectSystem le cerraría", () => {
      // El par del anterior: con ProtectSystem=strict y sin ReadWritePaths el servicio
      // corre, sale en verde y no escribe nada. Es la regresión más silenciosa de todas.
      expect(valor(SERVICIO, "Service", "ProtectSystem")).toBe("strict");
      expect(valor(SERVICIO, "Service", "ReadWritePaths")).toContain(
        `/var/backups/${entorno.base.replace("_", "-")}`,
      );
    });

    it("no trae ningún secreto embebido", () => {
      const texto = leer("crm-backup.service");
      expect(texto).not.toMatch(/PASSWORD=|PGPASSWORD|DATABASE_URL=|SECRET=/i);
    });
  });

  describe("el ejercicio de restauración también está agendado", () => {
    // Por qué existe este bloque: hasta la revisión de la 9.2, el backup tenía timer y el
    // ejercicio que comprueba que el backup sirve no lo tenía. O sea que la parte
    // automatizada era la que produce el archivo, y la parte que depende de que alguien se
    // acuerde era justamente la que distingue un backup de un archivo cualquiera.

    it("el ejercicio se instala como timer", () => {
      expect(valor(EJERCICIO_TIMER, "Install", "WantedBy")).toBe(
        "timers.target",
      );
    });

    it("dispara una vez por mes, no todos los días (D-3)", () => {
      const calendario = valor(EJERCICIO_TIMER, "Timer", "OnCalendar");
      expect(calendario).not.toBeNull();
      expect(esMensual(calendario as string)).toBe(true);
      expect(esDiario(calendario as string)).toBe(false);
    });

    it("`esMensual` no acepta lo diario disfrazado", () => {
      expect(esMensual("*-*-01 04:30:00 UTC")).toBe(true);
      expect(esMensual("*-*-* 04:30:00 UTC")).toBe(false);
      expect(esMensual("*-01-01 04:30:00 UTC")).toBe(false);
    });

    it("corre después del backup del día, no antes", () => {
      // Si corriera antes, el ejercicio validaría la copia de ayer y el backup de hoy
      // se quedaría sin ejercitar nunca.
      const backup = valor(TIMER, "Timer", "OnCalendar") as string;
      const ejercicio = valor(EJERCICIO_TIMER, "Timer", "OnCalendar") as string;
      const hora = (cal: string) => cal.trim().split(/\s+/)[1] ?? "";
      expect(hora(ejercicio) > hora(backup)).toBe(true);
      expect(hora(backup)).not.toBe("");
    });

    it("es Persistent: un reinicio el día 1 se comería el único ejercicio del mes", () => {
      expect(valor(EJERCICIO_TIMER, "Timer", "Persistent")).toBe("true");
    });

    it("dispara el ejercicio y no el backup", () => {
      expect(valor(EJERCICIO_TIMER, "Timer", "Unit")).toBe(
        "crm-restore-check.service",
      );
      expect(valor(EJERCICIO, "Service", "ExecStart")).toContain(
        "crm-restore-check.sh",
      );
    });

    it("corre como postgres, que es quien puede crear y borrar una base", () => {
      // Como root funcionaría también, y por eso es fácil que alguien lo cambie: un
      // ejercicio de restauración que necesita root es un ejercicio que no se corre.
      expect(valor(EJERCICIO, "Service", "User")).toBe("postgres");
    });

    it("no necesita escribir fuera de su /tmp privado", () => {
      expect(valor(EJERCICIO, "Service", "PrivateTmp")).toBe("true");
      expect(valor(EJERCICIO, "Service", "ProtectSystem")).toBe("strict");
    });
  });

  // --- La rotación, por comportamiento ------------------------------------------------

  const ENTORNO = {
    BACKUP_DIR: `/var/backups/${entorno.base.replace("_", "-")}`,
    PGDATABASE: entorno.base,
    BACKUP_KEEP: "7",
  };

  /** Diez copias, de la más vieja a la más nueva. */
  const COPIAS = [
    "20260913T031500Z",
    "20260914T031500Z",
    "20260915T031500Z",
    "20260916T031500Z",
    "20260917T031500Z",
    "20260918T031500Z",
    "20260919T031500Z",
    "20260920T031500Z",
    "20260921T031500Z",
    "20260922T031500Z",
  ].map((marca) => `${ENTORNO.BACKUP_DIR}/${entorno.base}-${marca}.dump`);

  const LAS_TRES_MAS_VIEJAS = COPIAS.slice(0, 3);
  const LAS_SIETE_MAS_NUEVAS = COPIAS.slice(3);

  /** El orden en que `find` entrega los archivos no está garantizado. */
  const DESORDENADAS = [...COPIAS].reverse();

  const ROTACION = extraerAsignacion(BACKUP, "sobrantes");

  describe("la rotación, simulada sobre la tubería real del script", () => {
    it("con 10 copias y BACKUP_KEEP=7, borra exactamente las 3 más viejas", () => {
      // `sobrantes` es la lista de lo que se BORRA. Que sean las más viejas es la
      // propiedad entera de la rotación.
      expect(simular(ROTACION, COPIAS, ENTORNO)).toEqual(LAS_TRES_MAS_VIEJAS);
    });

    it("no depende del orden en que find entregue los archivos", () => {
      // `find` recorre el directorio, no ordena. Una tubería que se apoye en ese orden
      // funciona hasta el día que el directorio cambia de forma.
      expect(simular(ROTACION, DESORDENADAS, ENTORNO)).toEqual(
        LAS_TRES_MAS_VIEJAS,
      );
    });

    it("no borra nada cuando hay menos copias que el tope", () => {
      expect(simular(ROTACION, COPIAS.slice(0, 5), ENTORNO)).toEqual([]);
    });

    it("no borra nada cuando hay exactamente el tope", () => {
      expect(simular(ROTACION, LAS_SIETE_MAS_NUEVAS, ENTORNO)).toEqual([]);
    });

    it("con el tope en 1 conserva una sola copia, y es la más nueva", () => {
      const sobrantes = simular(ROTACION, COPIAS, {
        ...ENTORNO,
        BACKUP_KEEP: "1",
      });
      expect(sobrantes).toEqual(COPIAS.slice(0, 9));
      expect(sobrantes).not.toContain(COPIAS.at(-1));
    });

    it("solo mira un directorio, solo archivos y solo los dumps de esta base", () => {
      const argv = aArgv(etapasDe(ROTACION)[0] ?? "").map((token) =>
        token.replace("${PGDATABASE}", ENTORNO.PGDATABASE),
      );
      expect(argv[0]).toBe("find");
      expect(argv[argv.indexOf("-maxdepth") + 1]).toBe("1");
      expect(argv[argv.indexOf("-type") + 1]).toBe("f");
      // Sin el prefijo de la base, la rotación borraría dumps de otra base que compartiera
      // directorio; sin el sufijo `.dump`, se llevaría puestos los `.sha256`.
      expect(argv[argv.indexOf("-name") + 1]).toBe(`${entorno.base}-*.dump`);
    });
  });

  describe("el simulador detecta lo que la búsqueda de texto no distinguía", () => {
    // Cada caso de acá es una mutación **ejecutada** contra el script real durante la
    // revisión independiente de la 9.2, y cada una pasaba en verde con la guarda anterior.
    // Quedan versionadas acá, y no solo narradas en la evidencia, porque una mutación que
    // no corre no protege de nada (EngineeringStandards, regla de mutación).

    it("`sort -r` invertiría la rotación y borraría las 3 más nuevas", () => {
      // Cinco caracteres. La subcadena `head -n "-$BACKUP_KEEP"` queda intacta, así que
      // la guarda anterior seguía en verde mientras la rotación se llevaba puesto el
      // backup de anoche y conservaba los siete más viejos.
      const mutada = ROTACION.replace(/\bsort\b/, "sort -r");
      const borradas = simular(mutada, COPIAS, ENTORNO);
      expect(borradas).toEqual([...COPIAS.slice(7)].reverse());
      expect(borradas).toContain(COPIAS.at(-1));
    });

    it("`head -n N` sin el signo dejaría pasar las 7 más viejas", () => {
      const mutada = ROTACION.replace(
        'head -n "-$BACKUP_KEEP"',
        'head -n "$BACKUP_KEEP"',
      );
      expect(simular(mutada, COPIAS, ENTORNO)).toEqual(COPIAS.slice(0, 7));
    });

    it("quitar el `sort` deja el resultado a merced del orden del directorio", () => {
      const mutada = ROTACION.replace(/\|\s*sort\b/, "");
      expect(simular(mutada, COPIAS, ENTORNO)).not.toEqual(
        simular(mutada, DESORDENADAS, ENTORNO),
      );
    });

    it("falla ante una orden que no conoce, en vez de dejarla pasar", () => {
      const mutada = ROTACION.replace(/\bsort\b/, "shuf");
      expect(() => simular(mutada, COPIAS, ENTORNO)).toThrow(
        /no conoce 'shuf'/,
      );
    });

    it("falla si la asignación desaparece del script", () => {
      expect(() => extraerAsignacion("echo hola\n", "sobrantes")).toThrow(
        /no hay ninguna asignación/,
      );
    });
  });

  describe("decisiones de los scripts cuya regresión sería silenciosa", () => {
    // Esto es comprobación **por texto** y por lo tanto más débil que lo de arriba. Va
    // igual porque cada una de estas regresiones deja el script corriendo en verde.

    it("los dos scripts abortan ante el primer error y ante un fallo de tubería", () => {
      // Sin `-e` el script sigue después de un pg_dump fallido y renombra el parcial como
      // si fuera bueno; sin `-o pipefail` una tubería devuelve el estado de la última
      // orden, no el del dump. En los dos casos el servicio sale 0 y el timer queda en
      // verde. Mutación ejecutada: quitar la línea pasaba los 20 casos anteriores.
      expect(BACKUP).toMatch(/^set -euo pipefail$/m);
      expect(RESTORE).toMatch(/^set -euo pipefail$/m);
    });

    it("el dump usa formato custom: el plano no permite restaurar una sola tabla", () => {
      expect(BACKUP).toMatch(/--format=custom/);
    });

    it("escribe a un archivo parcial y lo renombra al final", () => {
      // Sin esto, un corte a mitad del dump deja un archivo con nombre definitivo que la
      // rotación cuenta como copia válida.
      expect(BACKUP).toMatch(/\$destino\.parcial/);
      expect(BACKUP).toMatch(/mv "\$parcial" "\$destino"/);
    });

    it("valida BACKUP_KEEP antes de rotar, y eso evita borrarlo todo", () => {
      expect(BACKUP).toMatch(/BACKUP_KEEP =~ \^\[0-9\]\+\$/);
      expect(BACKUP).toMatch(/BACKUP_KEEP < 1/);
      // Lo que esa validación evita, medido en vez de razonado: con el tope en cero,
      // `head -n -0` deja pasar TODO y la rotación se lleva las diez copias.
      expect(
        simular(ROTACION, COPIAS, { ...ENTORNO, BACKUP_KEEP: "0" }),
      ).toEqual(COPIAS);
    });

    it("el backup escribe un manifiesto de recuentos junto al dump", () => {
      // Sin manifiesto, el ejercicio solo puede compararse contra el origen leído en su
      // propio momento, que es un blanco móvil: toda escritura posterior al dump lo hace
      // fallar. Medido el 2026-09-22 al desplegar el timer por primera vez — falló con
      // `login_attempts 2 -> 0` por escrituras normales de la aplicación.
      expect(codigoDe(BACKUP)).toMatch(/\$parcial\.recuentos/);
      expect(codigoDe(BACKUP)).toMatch(
        /mv "\$parcial\.recuentos" "\$destino\.recuentos"/,
      );
    });

    it("un manifiesto vacío aborta el backup en vez de guardarse", () => {
      // Un manifiesto vacío haría pasar el ejercicio siempre: comparar dos conjuntos
      // vacíos da igual. Es el mismo agujero que el corte de `tablas == 0`, un paso antes.
      expect(codigoDe(BACKUP)).toMatch(/! -s \$parcial\.recuentos/);
    });

    it("la rotación se lleva el manifiesto junto con su dump", () => {
      // Si quedaran huérfanos, el directorio acumularía manifiestos de dumps borrados para
      // siempre: la rotación dejaría de acotar lo que ocupa.
      expect(codigoDe(BACKUP)).toMatch(
        /rm -f "\$viejo" "\$viejo\.sha256" "\$viejo\.recuentos"/,
      );
    });

    it("el ejercicio compara contra el manifiesto, no contra el origen", () => {
      expect(codigoDe(RESTORE)).toMatch(/MANIFIESTO="\$DUMP\.recuentos"/);
      expect(codigoDe(RESTORE)).toMatch(/referencia="\$MANIFIESTO"/);
    });

    it("los dos scripts cuentan filas con la MISMA consulta", () => {
      // Acoplamiento real y no evidente: si las dos consultas divergieran —una contando
      // `pg_tables` y la otra `pg_class`, por ejemplo— el ejercicio fallaría por la
      // diferencia entre dos consultas y nadie miraría el backup, que estaría sano.
      const consulta = (script: string) => {
        const desde = script.indexOf("SELECT c.relname");
        expect(desde).toBeGreaterThan(-1);
        return script
          .slice(desde, script.indexOf("ORDER BY c.relname", desde))
          .replace(/\s+/g, " ")
          .trim();
      };
      expect(consulta(BACKUP)).toBe(consulta(RESTORE));
    });

    it("el ejercicio de restauración compara contenido, no el código de salida", () => {
      expect(RESTORE).toMatch(/select count\(\*\) as cnt from public/);
      expect(RESTORE).toMatch(/diff -u/);
    });

    it("el ejercicio falla si no hay ninguna tabla", () => {
      // Sin este corte, comparar dos conjuntos vacíos pasa siempre y el ejercicio entero
      // se vuelve incapaz de fallar.
      expect(RESTORE).toMatch(/tablas == 0/);
    });

    it("el ejercicio restaura SIN --no-owner, como manda el runbook", () => {
      // Con `--no-owner` las tablas quedan de `postgres` y no de `crm_owner`: la
      // aplicación anda, el ejercicio pasa, y la próxima migración falla con `must be
      // owner of table clients`, muy lejos del momento en que se causó. Medido el
      // 2026-09-22 en el simulacro. Si el ejercicio usa el flag, deja de ensayar
      // exactamente el paso que rompe una recuperación real.
      expect(codigoDe(RESTORE)).not.toMatch(/--no-owner/);
      // Y el comentario que lo explica sigue ahí: si alguien vuelve a poner el flag,
      // que al menos lea por qué no va.
      expect(RESTORE).toMatch(/SIN --no-owner/);
    });

    it("`codigoDe` no confunde una advertencia con la cosa advertida", () => {
      // El caso que hace falsa la aserción de arriba si se la escribe sobre el texto
      // entero: el script dice «SIN --no-owner» en un comentario.
      expect(
        codigoDe("# ojo con --no-owner\npg_restore --dbname=x\n"),
      ).not.toMatch(/--no-owner/);
      expect(codigoDe("  pg_restore --no-owner x\n")).toMatch(/--no-owner/);
    });

    it("la base restaurada se borra aunque el ejercicio reviente a la mitad", () => {
      expect(RESTORE).toMatch(/trap limpiar EXIT/);
      expect(RESTORE).toMatch(/dropdb --if-exists/);
    });

    it("ninguno de los dos scripts imprime un secreto", () => {
      for (const script of [BACKUP, RESTORE]) {
        expect(script).not.toMatch(/echo .*\$(PGPASSWORD|DATABASE_URL)/);
        expect(script).not.toMatch(/PGPASSWORD=/);
      }
    });
  });
});

// --- Solo producción: el cifrado y la copia externa (brief-13.1, D-8) -----------------

const PROD_BACKUP = readFileSync("deploy/production/crm-backup.sh", "utf8");
const PROD_OFFSITE = readFileSync(
  "deploy/production/crm-backup-offsite.sh",
  "utf8",
);
const PROD_SERVICIO = parsearUnidad(
  readFileSync("deploy/production/crm-backup.service", "utf8"),
);
const PROD_OFFSITE_SERVICIO = parsearUnidad(
  readFileSync("deploy/production/crm-backup-offsite.service", "utf8"),
);

/** Línea (base 0) de la primera coincidencia en el código sin comentarios, o -1. */
function lineaDe(script: string, patron: RegExp): number {
  return codigoDe(script)
    .split("\n")
    .findIndex((linea) => patron.test(linea));
}

describe("producción: el dump se cifra antes de que exista con nombre definitivo", () => {
  it("cifra con age para una clave pública, nunca con una contraseña", () => {
    expect(codigoDe(PROD_BACKUP)).toMatch(
      /age --encrypt --recipients-file "\$BACKUP_AGE_RECIPIENTS"/,
    );
    expect(codigoDe(PROD_BACKUP)).not.toMatch(/age .*--passphrase|age .* -p\b/);
  });

  it("falla sin clave pública ANTES del dump, no después", () => {
    const control = lineaDe(PROD_BACKUP, /! -s \$BACKUP_AGE_RECIPIENTS/);
    const dump = lineaDe(PROD_BACKUP, /^pg_dump /);
    expect(control).toBeGreaterThan(-1);
    expect(dump).toBeGreaterThan(control);
  });

  it("cifra antes de renombrar el dump: un corte no deja un .age definitivo", () => {
    const cifrado = lineaDe(PROD_BACKUP, /^age --encrypt/);
    const renombre = lineaDe(PROD_BACKUP, /^mv "\$parcial" "\$destino"$/);
    expect(cifrado).toBeGreaterThan(-1);
    expect(renombre).toBeGreaterThan(cifrado);
  });

  // La mutación de este caso (mover el cifrado después del renombre) se corrió sobre el archivo
  // real y hace fallar el caso de arriba (evidencia-13.1, AC-3). Había acá un caso que mutaba el
  // texto y miraba su propio cambio: no podía fallar, y lo sacó la revisión independiente.

  it("el trap limpia también la copia cifrada parcial", () => {
    expect(codigoDe(PROD_BACKUP)).toMatch(
      /limpiar\(\) \{ rm -f .*"\$parcial\.age"/,
    );
  });

  it("la rotación local se lleva también la copia cifrada", () => {
    expect(codigoDe(PROD_BACKUP)).toMatch(
      /rm -f "\$viejo" "\$viejo\.sha256" "\$viejo\.recuentos" "\$viejo\.age" "\$viejo\.age\.sha256"/,
    );
  });
});

describe("producción: la copia externa sube solo lo cifrado", () => {
  it("elige la última copia por su extensión .age", () => {
    expect(codigoDe(PROD_OFFSITE)).toMatch(
      /-name "\$\{PGDATABASE\}-\*\.dump\.age"/,
    );
  });

  it("sube solo el .age, su suma y el manifiesto: nunca el dump en claro", () => {
    const subidas = /for archivo in (.+); do/.exec(codigoDe(PROD_OFFSITE))?.[1];
    expect(subidas).toBe('"$ultima" "$ultima.sha256" "$base.recuentos"');
    // `$base` es el dump en claro: puede aparecer solo con el sufijo del manifiesto.
    expect(subidas).not.toMatch(/"\$base"/);
  });

  // La mutación de este caso (agregar el dump en claro a la subida) se corrió sobre el archivo real
  // y hace fallar el caso de arriba (evidencia-13.1, AC-3). El caso que la simulaba acá miraba su
  // propio cambio y no podía fallar; lo sacó la revisión independiente.

  // 13.1.2: con una clave limitada a un bucket, rclone sin esta opción intenta crear el bucket
  // antes de subir y falla con 403 aunque listar funcione. Medido en la primera subida real.
  it("sube sin intentar crear el bucket, que la clave limitada no puede", () => {
    expect(codigoDe(PROD_OFFSITE)).toMatch(
      /rclone copyto --config "\$RCLONE_CONFIG" --s3-no-check-bucket/,
    );
  });

  it("comprueba el tamaño remoto contra el local, no confía en el código de salida", () => {
    expect(codigoDe(PROD_OFFSITE)).toMatch(/rclone size/);
    expect(codigoDe(PROD_OFFSITE)).toMatch(/\$local_bytes != "\$remoto_bytes"/);
  });

  it("valida la retención externa: al menos 7 días", () => {
    expect(codigoDe(PROD_OFFSITE)).toMatch(/OFFSITE_KEEP_DAYS < 7/);
    expect(codigoDe(PROD_OFFSITE)).toMatch(
      /rclone delete .*--min-age "\$\{OFFSITE_KEEP_DAYS\}d"/,
    );
  });

  it("aborta ante el primer error", () => {
    expect(PROD_OFFSITE).toMatch(/^set -euo pipefail$/m);
  });
});

describe("producción: las unidades separan la base de la red", () => {
  it("la copia externa corre solo después de un backup exitoso", () => {
    // Desde la 13.3 el backup dispara dos unidades, así que se mira la lista entera: con
    // `valor`, que devuelve la última, este caso habría pasado a mirar el aviso de vida.
    expect(valores(PROD_SERVICIO, "Unit", "OnSuccess")).toContain(
      "crm-backup-offsite.service",
    );
  });

  it("OnSuccess puesto en [Service] no hace nada, y se detecta", () => {
    const mal = parsearUnidad(
      "[Service]\nOnSuccess=crm-backup-offsite.service\n",
    );
    expect(valor(mal, "Unit", "OnSuccess")).toBeNull();
  });

  it("el backup sigue sin red: la subida vive en otra unidad", () => {
    expect(valor(PROD_SERVICIO, "Service", "IPAddressDeny")).toBe("any");
  });

  it("la unidad de la copia externa ejecuta el script de subida y no escribe en disco", () => {
    expect(valor(PROD_OFFSITE_SERVICIO, "Service", "ExecStart")).toBe(
      "/usr/local/bin/crm-backup-offsite.sh",
    );
    expect(valor(PROD_OFFSITE_SERVICIO, "Service", "ProtectSystem")).toBe(
      "strict",
    );
    expect(
      valor(PROD_OFFSITE_SERVICIO, "Service", "ReadWritePaths"),
    ).toBeNull();
  });

  it("ningún archivo de producción trae un secreto embebido", () => {
    for (const texto of [PROD_BACKUP, PROD_OFFSITE]) {
      expect(texto).not.toMatch(
        /PGPASSWORD=|AWS_SECRET|RCLONE_CONFIG_.*_SECRET|secret_access_key/i,
      );
    }
  });
});

// --- Solo producción: el aviso de vida de cada trabajo programado (brief-13.3, D-3) -------
//
// Un trabajo programado que falla no avisa (H-1 de la 13.3). El aviso de vida es lo único
// que convierte esa falla en una alerta, así que perderlo es volver al silencio, y perderlo
// tampoco avisa. Lo que se afirma acá es **el grafo**: desde cada timer, siguiendo los
// `OnSuccess=`, todo servicio alcanzado que no sea el aviso mismo tiene que disparar su
// aviso. Así, un trabajo nuevo con su timer y sin aviso se pone rojo solo, sin que nadie
// se acuerde de sumarlo a una lista.
//
// Lo que NO comprueba: que el servidor tenga estas unidades, ni que el servicio externo
// esté configurado. Eso se ve provocando la falla (AC-10 de la 13.3).

const AVISO = /^crm-heartbeat@([a-z-]+)\.service$/;

/**
 * Servicios alcanzados desde los timers de un directorio, siguiendo `OnSuccess=`, que no
 * disparan su aviso de vida. Recibe los archivos por nombre para poder mutarlos en memoria.
 */
export function trabajosSinAviso(
  archivos: ReadonlyMap<string, string>,
): string[] {
  const unidad = (nombre: string) => {
    const texto = archivos.get(nombre);
    return texto === undefined ? undefined : parsearUnidad(texto);
  };

  const pendientes = [...archivos.keys()]
    .filter((nombre) => nombre.endsWith(".timer"))
    .map(
      (nombre) =>
        valor(parsearUnidad(archivos.get(nombre) ?? ""), "Timer", "Unit") ??
        nombre.replace(/\.timer$/, ".service"),
    );
  const vistos = new Set<string>();
  const sinAviso: string[] = [];

  while (pendientes.length > 0) {
    const servicio = pendientes.pop() as string;
    if (vistos.has(servicio) || AVISO.test(servicio)) continue;
    vistos.add(servicio);

    const leida = unidad(servicio);
    // Un timer que apunta a un servicio que no está versionado también es un trabajo sin
    // aviso: no hay de dónde saldría.
    const siguientes = leida ? valores(leida, "Unit", "OnSuccess") : [];
    if (!siguientes.some((s) => AVISO.test(s))) sinAviso.push(servicio);
    pendientes.push(...siguientes);
  }

  return sinAviso.sort();
}

/**
 * Cada lugar de las unidades que nombra un aviso de vida fuera de `[Unit] OnSuccess=`,
 * como `archivo [Sección] Clave`. Un aviso en `OnFailure=` o en un `ExecStopPost=` sale
 * también cuando el trabajo falla, y eso apaga la alerta: es peor que no tener aviso
 * (revisión independiente de la 13.3, hallazgo 5a). La unidad del aviso no cuenta.
 */
export function avisosFueraDeOnSuccess(
  archivos: ReadonlyMap<string, string>,
): string[] {
  const fuera: string[] = [];
  for (const [nombre, texto] of archivos) {
    if (nombre === "crm-heartbeat@.service") continue;
    for (const [seccion, claves] of parsearUnidad(texto)) {
      for (const [clave, vals] of claves) {
        if (seccion === "Unit" && clave === "OnSuccess") continue;
        if (vals.some((v) => v.includes("crm-heartbeat"))) {
          fuera.push(`${nombre} [${seccion}] ${clave}`);
        }
      }
    }
  }
  return fuera.sort();
}

/**
 * Las líneas de código del script de aviso que tocan la URL: la leen (`${!variable}`), la
 * asignan o la usan (`$url`, `${url}`). Recortadas, sin comentarios.
 */
export function usosDeLaUrl(script: string): string[] {
  return codigoDe(script)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /\$\{?url\b|\$\{!variable|^url=/.test(l));
}

/** Los trabajos que aceptan los `case` del script de aviso, en el orden en que aparecen. */
export function trabajosDelScript(script: string): string[] {
  return [...codigoDe(script).matchAll(/^\s*([a-z-]+)\) variable=/gm)].map(
    (m) => m[1] as string,
  );
}

const PROD_DIR = "deploy/production";
const PROD_ARCHIVOS: ReadonlyMap<string, string> = new Map(
  readdirSync(PROD_DIR)
    .filter((nombre) => /\.(service|timer)$/.test(nombre))
    .map((nombre) => [nombre, readFileSync(`${PROD_DIR}/${nombre}`, "utf8")]),
);
const PROD_AVISO_SCRIPT = readFileSync(`${PROD_DIR}/crm-heartbeat.sh`, "utf8");
const PROD_AVISO_UNIDAD = parsearUnidad(
  readFileSync(`${PROD_DIR}/crm-heartbeat@.service`, "utf8"),
);

describe("producción: cada trabajo programado manda su aviso de vida", () => {
  it("todo servicio alcanzado desde un timer dispara su aviso", () => {
    expect(trabajosSinAviso(PROD_ARCHIVOS)).toEqual([]);
  });

  it("recorre los tres trabajos: el backup, la copia externa y el ejercicio", () => {
    // El control del anterior: si el recorrido no siguiera los OnSuccess=, la copia
    // externa, que no tiene timer, quedaría fuera y el caso de arriba pasaría igual.
    const avisos = [...PROD_ARCHIVOS.values()]
      .flatMap((texto) => valores(parsearUnidad(texto), "Unit", "OnSuccess"))
      .filter((s) => AVISO.test(s))
      .sort();
    expect(avisos).toEqual([
      "crm-heartbeat@backup.service",
      "crm-heartbeat@offsite.service",
      "crm-heartbeat@restore-check.service",
    ]);
  });

  it("un trabajo que pierde su aviso se detecta", () => {
    // Se quita la unidad del aviso esté escrita como esté: en su propia línea o junto a
    // otra en la misma. La primera versión de este caso borraba una línea exacta y dejó de
    // mutar nada cuando el archivo pasó a una sola línea, que systemd acepta igual.
    const original = PROD_ARCHIVOS.get("crm-backup.service") ?? "";
    const mutado = original
      .replace(/[ \t]*crm-heartbeat@backup\.service/g, "")
      .replace(/^OnSuccess=[ \t]*\r?\n/gm, "");
    expect(mutado).not.toBe(original);

    const sinAvisoDelBackup = new Map(PROD_ARCHIVOS);
    sinAvisoDelBackup.set("crm-backup.service", mutado);
    expect(trabajosSinAviso(sinAvisoDelBackup)).toEqual(["crm-backup.service"]);
  });

  it("un trabajo nuevo con timer y sin aviso se detecta", () => {
    const conTrabajoNuevo = new Map(PROD_ARCHIVOS);
    conTrabajoNuevo.set("crm-demo.timer", "[Timer]\nUnit=crm-demo.service\n");
    conTrabajoNuevo.set("crm-demo.service", "[Service]\nType=oneshot\n");
    expect(trabajosSinAviso(conTrabajoNuevo)).toEqual(["crm-demo.service"]);
  });

  it("un aviso puesto en [Service] no cuenta: systemd lo ignora ahí", () => {
    const mal = new Map(PROD_ARCHIVOS);
    mal.set(
      "crm-restore-check.service",
      "[Unit]\n[Service]\nOnSuccess=crm-heartbeat@restore-check.service\n",
    );
    expect(trabajosSinAviso(mal)).toEqual(["crm-restore-check.service"]);
  });

  it("el script acepta exactamente los trabajos que las unidades disparan", () => {
    // Un aviso disparado para un trabajo que el script no conoce sale con error y la
    // alerta suena por ausencia; uno que el script conoce y nadie dispara es código muerto.
    const disparados = [...PROD_ARCHIVOS.values()]
      .flatMap((texto) => valores(parsearUnidad(texto), "Unit", "OnSuccess"))
      .map((s) => AVISO.exec(s)?.[1])
      .filter((t): t is string => t !== undefined)
      .sort();
    expect([...trabajosDelScript(PROD_AVISO_SCRIPT)].sort()).toEqual(
      disparados,
    );
  });

  it("ningún aviso sale por otro camino que OnSuccess=", () => {
    expect(avisosFueraDeOnSuccess(PROD_ARCHIVOS)).toEqual([]);
  });

  it("un aviso conectado a la falla se detecta", () => {
    const original = PROD_ARCHIVOS.get("crm-backup.service") ?? "";
    const conFalla = new Map(PROD_ARCHIVOS);
    conFalla.set(
      "crm-backup.service",
      original.replace(
        /^\[Unit\]$/m,
        "[Unit]\nOnFailure=crm-heartbeat@backup.service",
      ),
    );
    conFalla.set(
      "crm-restore-check.service",
      (PROD_ARCHIVOS.get("crm-restore-check.service") ?? "").replace(
        /^\[Service\]$/m,
        "[Service]\nExecStopPost=/bin/systemctl start crm-heartbeat@restore-check.service",
      ),
    );
    expect(avisosFueraDeOnSuccess(conFalla)).toEqual([
      "crm-backup.service [Unit] OnFailure",
      "crm-restore-check.service [Service] ExecStopPost",
    ]);
  });

  it("un OnSuccess= vacío debajo del aviso lo borra, como en systemd", () => {
    const original = PROD_ARCHIVOS.get("crm-backup.service") ?? "";
    const mutado = original.replace(
      /^(OnSuccess=crm-heartbeat@backup\.service)$/m,
      "$1\nOnSuccess=",
    );
    expect(mutado).not.toBe(original);
    const conReinicio = new Map(PROD_ARCHIVOS);
    conReinicio.set("crm-backup.service", mutado);
    expect(trabajosSinAviso(conReinicio)).toContain("crm-backup.service");
  });
});

describe("producción: la unidad del aviso no puede más que avisar", () => {
  it("corre con un usuario efímero y lee las URLs de un archivo fuera del repositorio", () => {
    expect(valor(PROD_AVISO_UNIDAD, "Service", "DynamicUser")).toBe("true");
    expect(valor(PROD_AVISO_UNIDAD, "Service", "EnvironmentFile")).toBe(
      "/etc/crm-production/heartbeat.env",
    );
    expect(valor(PROD_AVISO_UNIDAD, "Service", "ExecStart")).toBe(
      "/usr/local/bin/crm-heartbeat.sh %i",
    );
  });

  it("no escribe en disco", () => {
    expect(valor(PROD_AVISO_UNIDAD, "Service", "ProtectSystem")).toBe("strict");
    expect(valor(PROD_AVISO_UNIDAD, "Service", "ReadWritePaths")).toBeNull();
  });

  it("el script nunca imprime la URL, ni en el mensaje de curl", () => {
    // Una lista cerrada de los usos de la URL, en vez de buscar formas de imprimirla: la
    // primera versión miraba solo los `echo` y no veía `printf`, `${!variable}`, `curl -v`
    // ni `--write-out` (revisión independiente de la 13.3, hallazgo 5c).
    expect(usosDeLaUrl(PROD_AVISO_SCRIPT)).toEqual([
      "url=${!variable:-}",
      "if [[ -z $url ]]; then",
      `printf 'url = "%s"\\n' "$url" |`,
    ]);
    // El mensaje de error de curl puede traer la URL: se descarta y queda el código.
    // Y ninguna opción de curl que la escriba en la salida.
    const codigo = codigoDe(PROD_AVISO_SCRIPT);
    expect(codigo).toMatch(
      /--output \/dev\/null 2>\/dev\/null \|\| codigo=\$\?/,
    );
    expect(codigo).not.toMatch(
      /\s(-v|--verbose|-w|--write-out|--trace\S*|-i|--include|-D|--dump-header|--stderr)\b/,
    );
  });

  it("la URL no va en los argumentos de curl, que se leen en /proc", () => {
    // Las líneas continuadas con `\` son un solo comando: se unen antes de mirar. La
    // primera versión de este caso miraba línea por línea y no vio la URL agregada en la
    // continuación, con la mutación ejecutada.
    const codigo = codigoDe(PROD_AVISO_SCRIPT).replace(/\\\r?\n\s*/g, " ");
    expect(codigo).toMatch(/\|\s*curl --config - /);
    expect(codigo).not.toMatch(/curl[^\n|]*\$\{?url/);
  });

  it("un uso nuevo de la URL se detecta", () => {
    const conPrintf = PROD_AVISO_SCRIPT.replace(
      /^echo "Aviso de '\$trabajo' enviado\."$/m,
      'printf "%s\\n" "${!variable}"',
    );
    expect(conPrintf).not.toBe(PROD_AVISO_SCRIPT);
    expect(usosDeLaUrl(conPrintf)).toContain('printf "%s\\n" "${!variable}"');
  });

  it("aborta ante el primer error", () => {
    expect(PROD_AVISO_SCRIPT).toMatch(/^set -euo pipefail$/m);
  });
});
