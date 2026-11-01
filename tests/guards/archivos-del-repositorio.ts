import { execFileSync } from "node:child_process";

/**
 * Los archivos que una guarda tiene que mirar: los **versionados** y también los
 * **nuevos que todavía no están en el índice**.
 *
 * Existe porque cada guarda tenía su propia copia de `git ls-files` y cinco de las seis
 * se quedaron sin `--others`. Una guarda que enumera solo lo versionado **no ve un
 * archivo nuevo y pasa en verde sin haberlo leído**: es el falso verde que el proyecto
 * repitió en la 11.1, la 16.1, la 17.5, la 18.2, la 29.5 y la 24.5.2-b. La regla de
 * `git add -N` al crear cada archivo seguía dependiendo de que alguien se acordara, y
 * seis veces no alcanzó. Con una sola definición, arreglarlo es un lugar y no cinco.
 *
 * - `--cached` hay que pedirlo explícito: deja de ser el modo por omisión en cuanto se
 *   pasa `--others`.
 * - `--exclude-standard` respeta `.gitignore`, así que `node_modules/`, `.next/` y los
 *   `.env` siguen afuera. Sin él, la enumeración se llenaría de dependencias.
 * - `-z` separa con NUL: un nombre con espacios o acentos no se parte.
 * - `--` cierra las opciones, para que un pathspec no se lea como una bandera.
 *
 * `cwd` es solo para la prueba de esta función, que arma un repositorio de juguete en un
 * directorio temporal en vez de crear y borrar archivos en el árbol real. Las guardas
 * corren en paralelo: un archivo que aparece y desaparece mientras otra guarda lo está
 * leyendo es un `ENOENT` intermitente.
 */
export function archivosDelRepositorio(
  pathspec: string[] = [],
  opciones: { cwd?: string } = {},
): string[] {
  return execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...pathspec,
    ],
    { encoding: "utf8", cwd: opciones.cwd },
  )
    .split("\0")
    .filter(Boolean);
}
