import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de la configuración del proxy de staging (brief-9.1, D-9; hallazgo H-1 de la
// revisión independiente del 2026-09-22, y N-1 de la segunda revisión del mismo día).
//
// Por qué existe: toda la resolución de H-3 descansa en que haya **un solo salto de proxy**
// y en que nginx **reemplace** `x-forwarded-for` en vez de agregarlo. La aplicación lee la
// última entrada de esa cabecera (`session-cookie.ts`), así que con dos saltos la última
// entrada deja de ser la IP del cliente, todas las peticiones vuelven a compartir clave y
// H-3 se reproduce **en silencio y pasando en verde**.
//
// **Reescrita el 2026-09-22.** La primera versión comprobaba *presencia de subcadenas* sobre
// el archivo entero, y se midió que dejaba pasar en verde las dos regresiones más plausibles:
//   1. agregar una **segunda** directiva `X-Forwarded-For` después de la correcta;
//   2. agregar un `location` nuevo **con `proxy_pass` y sin la cabecera**.
// Las dos siguen conteniendo la subcadena que la aserción positiva buscaba, y ninguna contiene
// la que la negativa prohibía. Es la cuarta vez en el proyecto que un detector nuevo ve una
// sola forma sintáctica; por eso ahora no se busca texto, se analiza la configuración.
//
// Qué hace ahora: parsea el archivo en bloques y, **para cada contexto que hace `proxy_pass`**,
// calcula las cabeceras efectivas aplicando la regla de herencia real de nginx —
// `proxy_set_header` se hereda del nivel anterior **solo si el nivel actual no declara
// ninguno**, es todo o nada— y exige que `X-Forwarded-For` y `X-Forwarded-Proto` queden
// fijadas **exactamente una vez** y con el valor esperado.
//
// **Por qué "exactamente una vez" y no "que gane la correcta"**: con dos directivas del mismo
// nombre en un mismo nivel, nginx emite las dos cabeceras y lo que la aplicación termina
// leyendo depende de cómo el servidor HTTP de Node une los duplicados. Decidir cuál gana
// exigiría modelar esa unión; rechazar el duplicado no exige modelar nada y no deja ningún
// caso ambiguo pasar. La guarda es más estricta que nginx a propósito.
//
// Lo que NO comprueba, y es su límite principal: **que el servidor tenga este archivo**.
// Nadie puede leer el servidor desde un test. La comparación entre lo versionado y lo
// desplegado es un paso manual del procedimiento de `deploy/staging/README.md`, y su
// resultado se registra al desplegar. Una guarda que fingiera comprobarlo sería peor que
// no tenerla.
//
// Otros límites del analizador, declarados para no confundirlos con cobertura:
//   - No resuelve `include`: una directiva traída de otro archivo es invisible acá.
//   - No modela `map`, `set` ni variables derivadas: compara el valor escrito, literal.
//   - No sabe qué `location` gana para una URL dada. No le hace falta: exige la cabecera
//     correcta en **todos** los contextos que proxean, que es más estricto.

type Directiva = { readonly nombre: string; readonly valor: string };

type Bloque = {
  readonly encabezado: string;
  readonly directivas: Directiva[];
  readonly hijos: Bloque[];
  readonly padre: Bloque | null;
};

const normalizar = (texto: string) => texto.trim().replace(/\s+/g, " ");

// Quita un único par de comillas envolventes. `"$remote_addr"` y `$remote_addr` son la
// misma configuración; `"$http_x_forwarded_for, $remote_addr"` sigue siendo distinta.
const sinComillas = (valor: string) =>
  /^(["']).*\1$/.test(valor) ? valor.slice(1, -1) : valor;

function parsear(texto: string): Bloque {
  const raiz: Bloque = {
    encabezado: "",
    directivas: [],
    hijos: [],
    padre: null,
  };
  let actual = raiz;
  let buffer = "";
  let comilla: string | null = null;

  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i] as string;

    if (comilla) {
      buffer += caracter;
      if (caracter === "\\") {
        buffer += texto[i + 1] ?? "";
        i += 1;
      } else if (caracter === comilla) {
        comilla = null;
      }
      continue;
    }

    if (caracter === '"' || caracter === "'") {
      comilla = caracter;
      buffer += caracter;
      continue;
    }

    // Un comentario llega hasta el fin de línea. Se descarta acá, dentro del mismo
    // recorrido, para que un `#` dentro de comillas no se confunda con uno de verdad.
    if (caracter === "#") {
      const fin = texto.indexOf("\n", i);
      i = fin === -1 ? texto.length : fin;
      continue;
    }

    if (caracter === "{") {
      const hijo: Bloque = {
        encabezado: normalizar(buffer),
        directivas: [],
        hijos: [],
        padre: actual,
      };
      actual.hijos.push(hijo);
      actual = hijo;
      buffer = "";
      continue;
    }

    if (caracter === "}") {
      buffer = "";
      actual = actual.padre ?? raiz;
      continue;
    }

    if (caracter === ";") {
      const linea = normalizar(buffer);
      if (linea) {
        const [nombre, ...resto] = linea.split(" ");
        actual.directivas.push({
          nombre: (nombre ?? "").toLowerCase(),
          valor: resto.join(" "),
        });
      }
      buffer = "";
      continue;
    }

    buffer += caracter;
  }

  return raiz;
}

// La regla de herencia de nginx: los `proxy_set_header` del nivel anterior se heredan
// **solo si el nivel actual no declara ninguno**. Es todo o nada, y es exactamente la
// trampa de la regresión 2: un `location` que declare cualquier otra cabecera pierde
// X-Forwarded-For sin escribir una sola línea sobre ella.
function cabecerasEfectivas(bloque: Bloque): Map<string, string[]> {
  for (let nivel: Bloque | null = bloque; nivel; nivel = nivel.padre) {
    const propias = nivel.directivas.filter(
      (directiva) => directiva.nombre === "proxy_set_header",
    );
    if (propias.length === 0) continue;

    const cabeceras = new Map<string, string[]>();
    for (const directiva of propias) {
      const [nombre, ...resto] = directiva.valor.split(" ");
      const clave = (nombre ?? "").toLowerCase();
      const valores = cabeceras.get(clave) ?? [];
      valores.push(sinComillas(resto.join(" ")));
      cabeceras.set(clave, valores);
    }
    return cabeceras;
  }
  return new Map();
}

export type ContextoProxy = {
  readonly ruta: string;
  readonly destino: string;
  readonly cabeceras: Map<string, string[]>;
};

export function contextosQueProxean(texto: string): ContextoProxy[] {
  const encontrados: ContextoProxy[] = [];

  const recorrer = (bloque: Bloque, ruta: readonly string[]) => {
    const propia = [...ruta, bloque.encabezado || "(raíz)"];
    const proxyPass = bloque.directivas.find((d) => d.nombre === "proxy_pass");
    if (proxyPass) {
      encontrados.push({
        ruta: propia.join(" > "),
        destino: proxyPass.valor,
        cabeceras: cabecerasEfectivas(bloque),
      });
    }
    bloque.hijos.forEach((hijo) => recorrer(hijo, propia));
  };

  recorrer(parsear(texto), []);
  return encontrados;
}

const EXIGIDAS = [
  // El valor tiene que ser `$remote_addr` y no `$proxy_add_x_forwarded_for`: el segundo
  // conserva en la cadena lo que mandó el cliente, y la app lee la última entrada.
  { cabecera: "x-forwarded-for", valor: "$remote_addr" },
  // De esta depende la emisión de HSTS (`src/proxy.ts`).
  { cabecera: "x-forwarded-proto", valor: "$scheme" },
] as const;

/** Devuelve la lista de problemas. Vacía significa configuración correcta. */
export function revisarProxy(texto: string): string[] {
  const contextos = contextosQueProxean(texto);
  if (contextos.length === 0) {
    return ["ningún bloque hace proxy_pass: el archivo no es el que se cree"];
  }

  const problemas: string[] = [];
  for (const contexto of contextos) {
    for (const { cabecera, valor } of EXIGIDAS) {
      const valores = contexto.cabeceras.get(cabecera) ?? [];
      if (valores.length === 0) {
        problemas.push(`${contexto.ruta}: proxea sin fijar ${cabecera}`);
      } else if (valores.length > 1) {
        problemas.push(
          `${contexto.ruta}: fija ${cabecera} ${valores.length} veces (${valores.join(" | ")})`,
        );
      } else if (valores[0] !== valor) {
        problemas.push(
          `${contexto.ruta}: fija ${cabecera} en "${valores[0]}", se espera "${valor}"`,
        );
      }
    }
  }
  return problemas;
}

const NGINX = readFileSync("deploy/staging/nginx-crm-staging.conf", "utf8");
const UNIDAD = readFileSync("deploy/staging/crm-staging.service", "utf8");

describe("el analizador distingue las regresiones que la versión anterior dejaba pasar", () => {
  // Los tres primeros casos son las regresiones **medidas** contra la guarda anterior: las
  // tres pasaban en verde. Van versionadas para que la corrección no se pierda.

  it("la configuración real no tiene problemas", () => {
    expect(revisarProxy(NGINX)).toEqual([]);
  });

  it("detecta una segunda directiva X-Forwarded-For agregada después de la correcta", () => {
    const regresion = NGINX.replace(
      "proxy_set_header X-Forwarded-Proto $scheme;",
      'proxy_set_header X-Forwarded-For "$http_x_forwarded_for, $remote_addr";\n        proxy_set_header X-Forwarded-Proto $scheme;',
    );
    expect(revisarProxy(regresion)).toEqual([
      expect.stringContaining("fija x-forwarded-for 2 veces"),
    ]);
  });

  it("detecta un location nuevo que proxea sin la cabecera", () => {
    const regresion = NGINX.replace(
      "    location / {",
      "    location /api {\n        proxy_pass http://127.0.0.1:3000;\n    }\n\n    location / {",
    );
    expect(revisarProxy(regresion)).toEqual([
      expect.stringContaining(
        "location /api: proxea sin fijar x-forwarded-for",
      ),
      expect.stringContaining(
        "location /api: proxea sin fijar x-forwarded-proto",
      ),
    ]);
  });

  it("detecta $proxy_add_x_forwarded_for, que es la regresión original de H-3", () => {
    const regresion = NGINX.replace(
      "X-Forwarded-For $remote_addr;",
      "X-Forwarded-For $proxy_add_x_forwarded_for;",
    );
    expect(revisarProxy(regresion)).toEqual([
      expect.stringContaining('"$proxy_add_x_forwarded_for"'),
    ]);
  });

  // La trampa de la herencia: declarar **otra** cabecera en el location corta la herencia
  // entera del nivel de arriba. Nadie escribe X-Forwarded-For para romperlo.
  it("detecta que declarar otra cabecera en un location corta la herencia del server", () => {
    const configuracion = `
      server {
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        location /api {
          proxy_set_header Host $host;
          proxy_pass http://127.0.0.1:3000;
        }
      }`;
    expect(revisarProxy(configuracion)).toEqual([
      expect.stringContaining("proxea sin fijar x-forwarded-for"),
      expect.stringContaining("proxea sin fijar x-forwarded-proto"),
    ]);
  });

  // El par del caso anterior, y el que le da poder discriminante: un location **sin ningún**
  // proxy_set_header sí hereda, y eso es configuración correcta. Sin este caso, la guarda
  // podría estar exigiendo la directiva literal dentro de cada location y pasaría igual.
  it("acepta un location que hereda del server porque no declara ninguna cabecera", () => {
    const configuracion = `
      server {
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        location /api {
          proxy_pass http://127.0.0.1:3000;
        }
      }`;
    expect(revisarProxy(configuracion)).toEqual([]);
  });

  it("acepta el valor entre comillas, que es la misma configuración", () => {
    const equivalente = NGINX.replace(
      "X-Forwarded-For $remote_addr;",
      'X-Forwarded-For "$remote_addr";',
    );
    expect(revisarProxy(equivalente)).toEqual([]);
  });

  it("no cuenta como activa una directiva comentada", () => {
    const comentada = NGINX.replace(
      "proxy_set_header X-Forwarded-For $remote_addr;",
      "# proxy_set_header X-Forwarded-For $remote_addr;",
    );
    expect(revisarProxy(comentada)).toEqual([
      expect.stringContaining("proxea sin fijar x-forwarded-for"),
    ]);
  });

  it("avisa si el archivo deja de tener un proxy_pass", () => {
    expect(revisarProxy("server { listen 80; }")).toEqual([
      expect.stringContaining("ningún bloque hace proxy_pass"),
    ]);
  });
});

describe("configuración de nginx versionada", () => {
  it("proxea solo a loopback: la aplicación no se expone directamente", () => {
    const destinos = contextosQueProxean(NGINX).map((c) => c.destino);
    expect(destinos.length).toBeGreaterThan(0);
    expect(destinos).toEqual(destinos.map(() => "http://127.0.0.1:3000"));
  });

  it("redirige HTTP a HTTPS", () => {
    expect(NGINX).toMatch(/return\s+301\s+https:\/\//);
  });
});

describe("unidad de systemd versionada", () => {
  it("enlaza la aplicación solo a loopback", () => {
    // `next start` ignora la variable HOSTNAME: se comprobó el 2026-09-22, cuando se
    // enlazó a *:3000 y el cortafuegos quedó como única barrera. El flag es explícito
    // justamente porque la variable no alcanza.
    expect(UNIDAD).toMatch(/ExecStart=.*-H\s+127\.0\.0\.1/);
  });

  it("lee los secretos de un archivo fuera del repositorio", () => {
    expect(UNIDAD).toMatch(/EnvironmentFile=\/etc\/crm-staging\/app\.env/);
  });

  it("no trae ningún secreto embebido", () => {
    expect(UNIDAD).not.toMatch(/PASSWORD=|DATABASE_URL=|SECRET=/i);
  });

  it("arranca sola tras un reinicio", () => {
    expect(UNIDAD).toMatch(/WantedBy=multi-user\.target/);
  });
});
