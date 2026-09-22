import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guarda de la configuración del proxy de staging (brief-9.1, D-9; hallazgo H-1 de la
// revisión independiente del 2026-09-22).
//
// Por qué existe: toda la resolución de H-3 descansa en que haya **un solo salto de proxy**
// y en que nginx **reemplace** `x-forwarded-for` en vez de agregarlo. La aplicación lee la
// última entrada de esa cabecera (`session-cookie.ts`), así que con dos saltos la última
// entrada deja de ser la IP del cliente, todas las peticiones vuelven a compartir clave y
// H-3 se reproduce **en silencio y pasando en verde**.
//
// Hasta esta guarda, esa premisa vivía solo en el servidor: no se podía auditar ni detectar
// su regresión. La D-3 del mismo brief exige «una guarda, no una promesa» para el hostname;
// esto aplica el mismo criterio a la premisa que más pesa.
//
// Lo que esta guarda comprueba: que el archivo **versionado** siga diciendo lo que debe.
//
// Lo que NO comprueba, y es su límite principal: **que el servidor tenga este archivo**.
// Nadie puede leer el servidor desde un test. La comparación entre lo versionado y lo
// desplegado es un paso manual del procedimiento de `deploy/staging/README.md`, y su
// resultado se registra al desplegar. Una guarda que fingiera comprobarlo sería peor que
// no tenerla.

// Los comentarios se descartan antes de comprobar nada, por dos motivos. El primero es que
// el propio archivo **nombra** `$proxy_add_x_forwarded_for` en el comentario que explica por
// qué no se usa, y sin esto la aserción negativa fallaría contra la configuración correcta.
// El segundo importa más: una directiva comentada no está activa, así que tampoco debe
// contar como presente en las aserciones positivas.
function sinComentarios(contenido: string): string {
  return contenido
    .split("\n")
    .map((linea) => linea.replace(/#.*$/, ""))
    .join("\n");
}

const NGINX = sinComentarios(
  readFileSync("deploy/staging/nginx-crm-staging.conf", "utf8"),
);
const UNIDAD = sinComentarios(
  readFileSync("deploy/staging/crm-staging.service", "utf8"),
);

describe("configuración de nginx versionada", () => {
  it("reemplaza x-forwarded-for con la IP que vio nginx", () => {
    expect(NGINX).toMatch(
      /proxy_set_header\s+X-Forwarded-For\s+\$remote_addr\s*;/i,
    );
  });

  // El par del caso anterior: sin este, cambiar `$remote_addr` por
  // `$proxy_add_x_forwarded_for` **y dejar las dos líneas** pasaría inadvertido.
  it("no agrega a la cadena existente: $proxy_add_x_forwarded_for reintroduce H-3", () => {
    expect(NGINX).not.toMatch(/\$proxy_add_x_forwarded_for/i);
  });

  it("declara el protocolo del cliente, del que depende la emisión de HSTS", () => {
    expect(NGINX).toMatch(
      /proxy_set_header\s+X-Forwarded-Proto\s+\$scheme\s*;/i,
    );
  });

  it("apunta a loopback: la aplicación no se expone directamente", () => {
    expect(NGINX).toMatch(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000\s*;/);
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
