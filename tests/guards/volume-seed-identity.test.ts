import { describe, expect, it } from "vitest";
import {
  VOLUME_DEFAULT_SIZE,
  VOLUME_DISTRIBUTION,
  VOLUME_ORDINAL_0,
  VOLUME_ORGANIZATION_ID,
  VOLUME_USER,
  volumeId,
  volumeMemberEmail,
  volumeOrganizationId,
  volumeUser,
  type VolumeShape,
} from "../../seeds/volume";

// Guarda de identidad del seed de volumen (9.3, AC-1 y AC-2).
//
// Fija dos invariantes que, si se rompen, **no avisan**:
//
// 1. **La organización ordinal 0 conserva sus identidades exactas.** La calibración de D-3
//    reproduce en staging la tanda de la 8.5 para separar "cambió la máquina" de "cambió la
//    distribución". Si los datos de la organización histórica cambiaran, esa resta daría un
//    factor equivocado y el error no se manifestaría como un fallo: se manifestaría como un
//    umbral mal calibrado que después clasifica consultas sanas como patológicas, o al revés.
// 2. **Ningún identificador colisiona entre organizaciones.** Esta sí falla ruidosamente —una
//    violación de clave primaria a mitad de una carga de veinte organizaciones— pero falla
//    después de haber escrito cientos de miles de filas, y en una máquina de un núcleo eso es
//    media hora perdida por algo que se comprueba en un milisegundo.
//
// Lo que esta guarda **no** comprueba: el contenido de las filas. Que el cliente i tenga el
// mismo nombre y el mismo teléfono que antes de la 9.3 depende del generador pseudoaleatorio y
// se comprueba contra la base en `tests/integration/conversations-seed.test.ts`, que es el único
// lugar donde se puede mirar una fila escrita.

const KINDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("la organización histórica no cambia", () => {
  it("conserva el id de organización y el usuario admin", () => {
    // Literales, no derivados: una guarda que recalcula con la misma función que vigila no
    // vigila nada. Estos tres valores están en la base de desarrollo desde la 6.2.
    expect(VOLUME_ORGANIZATION_ID).toBe("5eed0000-0000-4000-8000-000000000021");
    expect(VOLUME_USER.id).toBe("5eed0000-0000-4000-8000-000000000022");
    expect(VOLUME_USER.email).toBe("volumen@example.com");
    expect(VOLUME_USER.name).toBe("Admin de volumen");
  });

  it("conserva la derivación de ids de fila", () => {
    expect(volumeId(1, 0)).toBe("5eed0001-0000-4000-8000-000000000000");
    expect(volumeId(1, 9_999)).toBe("5eed0001-0000-4000-8000-00000000270f");
    expect(volumeId(4, 1)).toBe("5eed0004-0000-4000-8000-000000000001");
    expect(volumeId(7, 499)).toBe("5eed0007-0000-4000-8000-0000000001f3");
  });

  it("el ordinal 0 explícito da lo mismo que omitirlo", () => {
    for (const kind of KINDS) {
      expect(volumeId(kind, 42, 0)).toBe(volumeId(kind, 42));
    }
  });

  it("conserva los correos de los miembros", () => {
    expect(volumeMemberEmail(0, 0)).toBe("miembro0001@volumen.example");
    expect(volumeMemberEmail(0, 499)).toBe("miembro0500@volumen.example");
  });

  it("conserva su forma: 10.000 filas, 20 productos pesados, 500 miembros y cero eventos", () => {
    expect(VOLUME_ORDINAL_0).toEqual({
      ordinal: 0,
      size: VOLUME_DEFAULT_SIZE,
      heavyProducts: 20,
      members: 500,
      ingestionEvents: 0,
    });
    expect(VOLUME_DEFAULT_SIZE).toBe(10_000);
  });
});

describe("los ids no colisionan entre organizaciones", () => {
  const ordinales = VOLUME_DISTRIBUTION.map((shape) => shape.ordinal);

  it("cada organización tiene un id y un admin propios", () => {
    const orgs = new Set(ordinales.map(volumeOrganizationId));
    const admins = new Set(ordinales.map((o) => volumeUser(o).id));
    expect(orgs.size).toBe(ordinales.length);
    expect(admins.size).toBe(ordinales.length);
    // Y ninguno de los dos conjuntos pisa al otro.
    expect(new Set([...orgs, ...admins]).size).toBe(ordinales.length * 2);
  });

  // Cuenta los ids repetidos que una derivación produce **con los tamaños reales** de la
  // distribución. La versión de la 9.3 miraba 50 índices por organización y sus mutaciones
  // recalculaban aparte, sin pasar por el chequeo: una codificación aditiva como
  // `index + ordinal × 1000` no repite nada en los primeros 50 y sí a tamaño real, y la guarda
  // quedaba en verde (R-13 de la revisión de la 9.3, reproducido en la 11.0). Ahora la función
  // real y las mutantes pasan por el mismo chequeo.
  type Derivacion = (kind: 1, index: number, ordinal: number) => string;
  function repetidos(derivar: Derivacion): number {
    const ids = VOLUME_DISTRIBUTION.flatMap((shape) =>
      Array.from({ length: shape.size }, (_, i) =>
        derivar(1, i, shape.ordinal),
      ),
    );
    return ids.length - new Set(ids).size;
  }

  it("ningún id de fila se repite entre organizaciones, a tamaño real", () => {
    expect(repetidos(volumeId)).toBe(0);
  });

  it("para ningún tipo, en los bordes de cada organización", () => {
    for (const kind of KINDS) {
      const ids = VOLUME_DISTRIBUTION.flatMap((shape) =>
        [0, 1, shape.size - 1, shape.size, 130_000].map((i) =>
          volumeId(kind, i, shape.ordinal),
        ),
      );
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  // Mutaciones ejecutadas por el mismo chequeo. La primera es la forma anterior a la 9.3, sin el
  // ordinal; la segunda es la aditiva que la guarda de la 9.3 dejaba pasar.
  it("si el id pierde el ordinal, el chequeo lo detecta", () => {
    expect(repetidos((kind, i) => volumeId(kind, i, 0))).toBeGreaterThan(0);
  });

  it("si el ordinal se suma al índice, el chequeo lo detecta", () => {
    expect(
      repetidos((kind, i, ordinal) => volumeId(kind, i + ordinal * 1000, 0)),
    ).toBeGreaterThan(0);
  });

  // El chequeo de arriba mira el tipo 1 con índices menores que `size`, pero los mensajes, los
  // movimientos y los eventos usan índices mucho mayores (hasta unos 4 millones en los
  // movimientos). Una codificación aditiva con un desplazamiento más grande —`index + ordinal ×
  // 100.000`— no repite nada en el tipo 1 y sí en los mensajes (M-4 de la revisión independiente
  // de la 11.0). Por eso, además, la **forma** del id: cada id se desarma y tiene que devolver su
  // tipo, su ordinal y su índice, para todos los tipos y con índices grandes. Si el ordinal no
  // vive en su propio campo, ninguna codificación pasa, sea cual sea el desplazamiento.
  type DerivacionCualquiera = (
    kind: (typeof KINDS)[number],
    index: number,
    ordinal: number,
  ) => string;
  const INDICES = [0, 1, 9_999, 10_000, 130_000, 4_100_000, 2 ** 40];
  function deformados(derivar: DerivacionCualquiera): number {
    let malos = 0;
    for (const kind of KINDS) {
      for (const ordinal of ordinales) {
        for (const index of INDICES) {
          const partes = derivar(kind, index, ordinal).split("-");
          const ok =
            partes[0] === `5eed000${kind}` &&
            parseInt(partes[1]!, 16) === ordinal &&
            parseInt(partes[4]!, 16) === index;
          if (!ok) malos++;
        }
      }
    }
    return malos;
  }

  it("cada id devuelve su tipo, su ordinal y su índice, para todos los tipos", () => {
    expect(deformados(volumeId)).toBe(0);
  });

  it("con el ordinal sumado al índice con un desplazamiento grande, la forma lo detecta", () => {
    const aditivoGrande: DerivacionCualquiera = (kind, i, ordinal) =>
      volumeId(kind, i + ordinal * 100_000, 0);
    // El chequeo de repetidos no lo ve, que es exactamente el hueco de M-4.
    expect(repetidos(aditivoGrande)).toBe(0);
    expect(deformados(aditivoGrande)).toBeGreaterThan(0);
  });

  it("todos los ids son UUID versión 4 bien formados", () => {
    for (const ordinal of ordinales) {
      expect(volumeOrganizationId(ordinal)).toMatch(UUID_V4);
      expect(volumeUser(ordinal).id).toMatch(UUID_V4);
      for (const kind of KINDS) {
        expect(volumeId(kind, 130_000, ordinal)).toMatch(UUID_V4);
      }
    }
  });
});

describe("los correos son únicos en toda la tabla users", () => {
  // `users.email` es único globalmente y no por organización: es la trampa menos visible de
  // sembrar varias organizaciones con el mismo código, y la que no aparece con una sola.
  const correos = VOLUME_DISTRIBUTION.flatMap((shape) => [
    volumeUser(shape.ordinal).email,
    ...Array.from({ length: shape.members }, (_, i) =>
      volumeMemberEmail(shape.ordinal, i),
    ),
  ]);

  it("no hay ninguno repetido", () => {
    expect(new Set(correos).size).toBe(correos.length);
  });

  it("si el dominio de los miembros pierde el ordinal, aparecen repetidos", () => {
    const mutados = VOLUME_DISTRIBUTION.flatMap((shape) =>
      Array.from(
        { length: shape.members },
        (_, i) => `miembro${String(i + 1).padStart(4, "0")}@volumen.example`,
      ),
    );
    expect(new Set(mutados).size).toBeLessThan(mutados.length);
  });
});

describe("la distribución cumple D-1", () => {
  const clientes = (shape: VolumeShape) => shape.size;
  const total = VOLUME_DISTRIBUTION.reduce((sum, s) => sum + clientes(s), 0);

  it("son veinte organizaciones con ordinales únicos y consecutivos desde 0", () => {
    expect(VOLUME_DISTRIBUTION).toHaveLength(20);
    expect(VOLUME_DISTRIBUTION.map((s) => s.ordinal)).toEqual(
      Array.from({ length: 20 }, (_, i) => i),
    );
  });

  it("una grande, tres medianas y dieciséis chicas", () => {
    const tamaños = VOLUME_DISTRIBUTION.map((s) => s.size);
    expect(tamaños.filter((n) => n === 10_000)).toHaveLength(1);
    expect(tamaños.filter((n) => n === 1_000)).toHaveLength(3);
    expect(tamaños.filter((n) => n === 50)).toHaveLength(16);
  });

  it("una sola organización domina la tabla, que es lo que hace útil la comparación", () => {
    const mayor = Math.max(...VOLUME_DISTRIBUTION.map(clientes));
    // Si ninguna dominara, `organization_id = X` sería igual de poco selectivo para todas y la
    // medición no reproduciría ni el caso real ni el que la 8.5 ya midió.
    expect(mayor / total).toBeGreaterThan(0.5);
    // Y la chica tiene que ser una minoría clara, o no hay dos extremos que comparar.
    expect(Math.min(...VOLUME_DISTRIBUTION.map(clientes)) / total).toBeLessThan(
      0.01,
    );
  });

  it("la organización 0 de la distribución es la histórica más sus eventos", () => {
    const cero = VOLUME_DISTRIBUTION[0]!;
    expect({ ...cero, ingestionEvents: 0 }).toEqual(VOLUME_ORDINAL_0);
    expect(cero.ingestionEvents).toBeGreaterThan(0);
  });

  it("ninguna organización queda sin miembros ni sin productos pesados declarados", () => {
    for (const shape of VOLUME_DISTRIBUTION) {
      expect(shape.members).toBeGreaterThan(0);
      expect(shape.heavyProducts).toBeGreaterThanOrEqual(0);
      // Un producto pesado exige un producto: los productos acompañan al tamaño de clientes.
      expect(shape.heavyProducts).toBeLessThanOrEqual(shape.size);
    }
  });
});
