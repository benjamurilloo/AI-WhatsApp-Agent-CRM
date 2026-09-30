// Análisis de los planes de la 13.2.2: cada Seq Scan, los cambios de forma entre organizaciones y
// las consultas más lentas. Lee los tres archivos de planes de prod-13.2/.
/* global console, URL */
import { readFileSync } from "node:fs";

const dir = new URL("./prod-13.2/", import.meta.url);
const ORGS = ["grande", "chica", "concentrada"];

function parse(nombre) {
  const texto = readFileSync(new URL(`planes-${nombre}.md`, dir), "utf8");
  const consultas = [];
  let camino = null;
  let n = 0;
  const lineas = texto.split("\n");
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (l.startsWith("## ")) {
      camino = l.slice(3).trim();
      n = 0;
    } else if (l.startsWith("duration: ")) {
      const dur = Number(l.match(/duration: ([\d.]+) ms/)[1]);
      const cuerpo = [];
      let j = i + 1;
      while (j < lineas.length && lineas[j] !== "```") cuerpo.push(lineas[j++]);
      i = j;
      const q = cuerpo.find((x) => x.startsWith("Query Text: ")) ?? "";
      // El plan empieza después de Query Parameters (o de Query Text, si no hay parámetros).
      const desde = cuerpo.findIndex(
        (x, k) =>
          k > 0 &&
          !x.startsWith("Query Parameters: ") &&
          /\(cost=/.test(x) &&
          !/^\s/.test(x),
      );
      const plan = desde === -1 ? [] : cuerpo.slice(desde);
      const nodos = plan
        .filter((x) => /\(cost=/.test(x))
        .map((x) => ({
          crudo: x,
          firma: x
            .replace(/\s*\(cost=.*$/, "")
            .replace(/^(\s*)->\s*/, "$1")
            .replace(/\s+$/, ""),
          filas: Number((x.match(/actual time=[\d.]+\.\.[\d.]+ rows=([\d.]+)/) ?? [])[1] ?? NaN),
          loops: Number((x.match(/loops=(\d+)/) ?? [])[1] ?? NaN),
          nunca: /never executed/.test(x),
        }));
      consultas.push({
        camino,
        n: ++n,
        dur,
        sql: q.slice(12).replace(/\$\d+(, \$\d+)+/g, "$…"),
        plan,
        nodos,
      });
    }
  }
  return consultas;
}

// El nombre del camino cambia entre organizaciones cuando lleva un recuento («producto con 400»,
// «20 de 12, de 65260…»): se normaliza para poder cruzarlos.
const clave = (c) =>
  c.camino.replace(/\(producto con \d+/, "(producto con N").replace(/\(20 de \d+, de \d+ de la organización\)/, "(20)");

const datos = Object.fromEntries(ORGS.map((o) => [o, parse(o)]));

console.log("# Resumen");
for (const o of ORGS) {
  const d = datos[o];
  console.log(
    `${o}: ${d.length} consultas, ${d.filter((c) => c.nodos.some((x) => /Seq Scan/.test(x.firma))).length} con Seq Scan, ` +
      `${d.reduce((s, c) => s + c.nodos.filter((x) => /Seq Scan/.test(x.firma)).length, 0)} nodos Seq Scan, ` +
      `más lenta ${Math.max(...d.map((c) => c.dur)).toFixed(1)} ms`,
  );
}

console.log("\n# Las 12 consultas más lentas de cada organización");
for (const o of ORGS) {
  console.log(`## ${o}`);
  for (const c of [...datos[o]].sort((a, b) => b.dur - a.dur).slice(0, 12)) {
    console.log(`${c.dur.toFixed(1)} ms | ${c.camino} #${c.n} | ${c.nodos[0]?.firma}`);
  }
}

console.log("\n# Seq Scan: agrupados por (tabla, filtro), con dónde aparecen");
for (const o of ORGS) {
  console.log(`## ${o}`);
  const grupos = new Map();
  for (const c of datos[o]) {
    c.plan.forEach((l, i) => {
      if (!/Seq Scan/.test(l)) return;
      const tabla = (l.match(/Seq Scan on (\w+)/) ?? [])[1];
      // Las líneas de detalle del nodo: las siguientes con más sangría y sin «->».
      const det = [];
      for (let j = i + 1; j < c.plan.length && !/\(cost=/.test(c.plan[j]); j++) det.push(c.plan[j].trim());
      const filtro = (det.find((x) => x.startsWith("Filter: ")) ?? "sin filtro")
        .replace(/'[0-9a-f-]{36}'/g, "'uuid'")
        .replace(/'\d{4}-\d\d-\d\d[^']*'/g, "'fecha'");
      const quitadas = (det.find((x) => x.startsWith("Rows Removed by Filter: ")) ?? "").replace("Rows Removed by Filter: ", "");
      const m = l.match(/rows=(\d+) width=\d+\) \(actual time=([\d.]+)\.\.([\d.]+) rows=([\d.]+) loops=(\d+)/);
      const k = `${tabla} | ${filtro}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(
        `${c.camino} #${c.n}: est ${m?.[1]}, real ${m?.[4]}×${m?.[5]}, quitadas ${quitadas || 0}, nodo ${m?.[3]} ms, consulta ${c.dur.toFixed(1)} ms`,
      );
    });
  }
  for (const [k, v] of grupos) {
    console.log(`- ${k}  [${v.length}]`);
    for (const x of v) console.log(`    ${x}`);
  }
}

console.log("\n# Cambios de forma contra la grande");
const forma = (c) => c.nodos.map((x) => x.firma).join("\n");
for (const o of ["chica", "concentrada"]) {
  console.log(`## grande vs ${o}`);
  const otra = new Map(datos[o].map((c) => [`${clave(c)}#${c.n}`, c]));
  let iguales = 0;
  let distintas = 0;
  const sinPar = [];
  const vistas = new Set();
  for (const c of datos.grande) {
    const k = `${clave(c)}#${c.n}`;
    const p = otra.get(k);
    if (!p) {
      sinPar.push(k);
      continue;
    }
    if (p.sql !== c.sql) {
      console.log(`! ${k}: el SQL no coincide, no se compara`);
      continue;
    }
    if (forma(p) === forma(c)) {
      iguales++;
      continue;
    }
    distintas++;
    // La misma diferencia aparece en varios caminos: se imprime una vez por par de formas.
    const huella = `${forma(c)}\n---\n${forma(p)}`;
    if (vistas.has(huella)) {
      console.log(`= ${k}: misma diferencia que una anterior`);
      continue;
    }
    vistas.add(huella);
    console.log(`\n* ${k}  (grande ${c.dur.toFixed(1)} ms, ${o} ${p.dur.toFixed(1)} ms)`);
    console.log(`  SQL: ${c.sql.slice(0, 260)}`);
    console.log("  grande:");
    for (const x of c.nodos) console.log(`    ${x.firma}  [filas ${x.nunca ? "nunca" : x.filas}×${x.loops || ""}]`);
    console.log(`  ${o}:`);
    for (const x of p.nodos) console.log(`    ${x.firma}  [filas ${x.nunca ? "nunca" : x.filas}×${x.loops || ""}]`);
  }
  const claves = new Set(datos.grande.map((c) => `${clave(c)}#${c.n}`));
  const solo = datos[o].filter((c) => !claves.has(`${clave(c)}#${c.n}`)).map((c) => `${clave(c)}#${c.n}`);
  console.log(`\niguales: ${iguales}, distintas: ${distintas}, solo en grande: ${JSON.stringify(sinPar)}, solo en ${o}: ${JSON.stringify(solo)}`);
}
