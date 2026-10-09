import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import {
  handleImageFile,
  handleImageUpload,
} from "@/app/(autenticado)/productos/[productId]/imagen/handler";
import { hashPassword, login } from "@/modules/auth";
import {
  getProductImageVersions,
  IMAGE_UPLOAD_RATE,
  listProductAudit,
  removeProductImage,
  uploadProductImage,
} from "@/modules/catalog";
import { withImageSlot } from "@/modules/catalog/image-processing";
import { getAuthContext, type AuthContext } from "@/modules/organizations";
import { getDb, type DbTransaction } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Imagen principal de producto contra PostgreSQL real (brief-17.5): el esquema y sus privilegios
// (AC-1), la subida y el reemplazo (AC-2), los rechazos sin leer el cuerpo (AC-3, invariante 2),
// la concurrencia y el límite de tasa (AC-4), la ruta que sirve (AC-5), la auditoría sin bytes
// (AC-6), el aislamiento entre organizaciones (invariante 4) y las consultas de los scripts de
// operación (AC-8). Las imágenes se generan acá: ninguna es una foto ni muestra personas.

const PASSWORD = "contraseña-correcta-larga";
let storedHash: string;

const HOST = "localhost";
const ORIGIN = `http://${HOST}`;

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function addUser(
  organizationId: string,
  email: string,
  role: "admin" | "viewer",
) {
  const user = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name)
        values (${email}, ${storedHash}, 'Persona') returning id`,
  );
  await getDb().execute(
    sql`insert into organization_members (organization_id, user_id, role)
        values (${organizationId}, ${user.rows[0]!.id}, ${role})`,
  );
}

async function sessionFor(
  email: string,
): Promise<{ token: string; context: AuthContext }> {
  const logged = await login({ email, password: PASSWORD, ip: null });
  if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
  const result = await getAuthContext(logged.token);
  if (!result.ok) throw new Error(`contexto rechazado: ${result.code}`);
  return { token: logged.token, context: result.context };
}

async function createProduct(organizationId: string, sku: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into products (organization_id, sku, name)
        values (${organizationId}, ${sku}, ${`Producto ${sku}`}) returning id`,
  );
  return result.rows[0]!.id;
}

// A con un admin y un viewer, B con su admin; un producto en cada una y otro en A.
async function seed() {
  const orgA = await createOrganization("Negocio A");
  const orgB = await createOrganization("Negocio B");
  await addUser(orgA, "admin-a@example.com", "admin");
  await addUser(orgA, "viewer-a@example.com", "viewer");
  await addUser(orgB, "admin-b@example.com", "admin");
  return {
    orgA,
    orgB,
    productA: await createProduct(orgA, "A-1"),
    otherA: await createProduct(orgA, "A-2"),
    productB: await createProduct(orgB, "B-1"),
    adminA: await sessionFor("admin-a@example.com"),
    viewerA: await sessionFor("viewer-a@example.com"),
    adminB: await sessionFor("admin-b@example.com"),
  };
}

function jpeg(width = 2400, height = 1800, color = { r: 30, g: 90, b: 160 }) {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg()
    .withExif({
      IFD0: { Make: "Cámara de prueba" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "34/1 36/1 0/1" },
    })
    .toBuffer();
}

// Un PUT cuyo cuerpo registra si alguien lo leyó: highWaterMark 0 hace que el stream no se
// llene solo, así que pull corre solo cuando se lee (invariante 2).
function upload(
  productId: string,
  bytes: Uint8Array,
  options: {
    origin?: string | null;
    contentLength?: string | null;
  } = {},
) {
  let read = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        read = true;
        controller.enqueue(bytes);
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const headers: Record<string, string> = {
    host: HOST,
    "content-type": "image/jpeg",
  };
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.origin = origin;
  const length =
    options.contentLength === undefined
      ? String(bytes.byteLength)
      : options.contentLength;
  if (length !== null) headers["content-length"] = length;
  const request = new Request(`${ORIGIN}/productos/${productId}/imagen`, {
    method: "PUT",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
  return { request, wasRead: () => read };
}

async function put(
  productId: string,
  token: string | undefined,
  bytes: Uint8Array,
  options: Parameters<typeof upload>[2] = {},
) {
  const { request, wasRead } = upload(productId, bytes, options);
  const response = await handleImageUpload(request, productId, token);
  return {
    status: response.status,
    body: (await response.json()) as {
      ok: boolean;
      error?: string;
      sha256?: string;
    },
    retryAfter: response.headers.get("retry-after"),
    wasRead: wasRead(),
  };
}

function get(
  productId: string,
  token: string | undefined,
  {
    variant = "image",
    query = "",
    headers = {},
  }: {
    variant?: "image" | "thumbnail";
    query?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const path = variant === "image" ? "imagen" : "imagen/miniatura";
  return handleImageFile(
    new Request(`${ORIGIN}/productos/${productId}/${path}${query}`, {
      headers,
    }),
    productId,
    variant,
    token,
  );
}

async function storedRows(organizationId: string) {
  const result = await getDb().execute<{
    product_id: string;
    sha256: string;
    image: Buffer;
    width: number;
    height: number;
  }>(
    sql`select product_id, sha256, image, width, height from product_images
        where organization_id = ${organizationId} order by product_id`,
  );
  return result.rows;
}

async function imageAudits() {
  const result = await getDb().execute<{
    action: string;
    diff: { before: Record<string, unknown>; after: Record<string, unknown> };
  }>(
    sql`select action, diff from audit_logs
        where diff -> 'after' ? 'image' order by created_at`,
  );
  return result.rows;
}

async function pgError(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code ?? "sin código";
  }
  return "sin error";
}

function asAppRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role crm_app`);
    return fn(tx);
  });
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
});

describe("esquema de las imágenes (brief-17.5, AC-1)", () => {
  it("AC-1: crm_app sube y quita, sin UPDATE", async () => {
    const result = await getDb().execute<{ privilege: string }>(
      sql`select privilege_type as privilege
          from information_schema.role_table_grants
          where grantee = 'crm_app' and table_name = 'product_images'
          order by privilege_type`,
    );
    expect(result.rows.map((row) => row.privilege)).toEqual([
      "DELETE",
      "INSERT",
      "SELECT",
    ]);
    const s = await seed();
    await uploadProductImage(s.adminA.context, s.productA, await jpeg());
    expect(
      await pgError(
        asAppRole((tx) =>
          tx.execute(sql`update product_images set width = 10`),
        ),
      ),
    ).toBe("42501");
  });

  it("AC-1: la base rechaza una segunda posición, la imagen del producto de otra organización y un hash mal formado", async () => {
    const s = await seed();
    const image = Buffer.from([1, 2, 3]);
    const row = (org: string, product: string, position: number, sha: string) =>
      getDb().execute(
        sql`insert into product_images
              (organization_id, product_id, position, image, thumbnail, sha256, width, height, created_by)
            values (${org}, ${product}, ${position}, ${image}, ${image}, ${sha}, 1, 1, ${s.adminA.context.userId})`,
      );
    const sha = "a".repeat(64);
    expect(await pgError(row(s.orgA, s.productA, 1, sha))).toBe("23514");
    expect(await pgError(row(s.orgA, s.productB, 0, sha))).toBe("23503");
    expect(await pgError(row(s.orgA, s.productA, 0, "A".repeat(64)))).toBe(
      "23514",
    );
    expect(await pgError(row(s.orgA, s.productA, 0, sha))).toBe("sin error");
    expect(await pgError(row(s.orgA, s.productA, 0, sha))).toBe("23505");
  });
});

describe("subir, reemplazar y quitar (AC-2, AC-6)", () => {
  it("AC-2: el JPEG con GPS se guarda reducido, sin metadatos y con su hash; reemplazar deja una fila; quitar la borra", async () => {
    const s = await seed();
    const first = await put(s.productA, s.adminA.token, await jpeg());
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    let rows = await storedRows(s.orgA);
    expect(rows).toHaveLength(1);
    const stored = rows[0]!;
    const metadata = await sharp(stored.image).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
    expect([stored.width, stored.height]).toEqual([1600, 1200]);
    expect(stored.sha256).toBe(
      createHash("sha256").update(stored.image).digest("hex"),
    );
    expect(first.body.sha256).toBe(stored.sha256);

    const png = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    expect((await put(s.productA, s.adminA.token, png)).status).toBe(200);
    const webp = await sharp({
      create: { width: 500, height: 200, channels: 3, background: "#c33" },
    })
      .webp()
      .toBuffer();
    expect((await put(s.productA, s.adminA.token, webp)).status).toBe(200);

    rows = await storedRows(s.orgA);
    expect(rows).toHaveLength(1);
    expect([rows[0]!.width, rows[0]!.height]).toEqual([500, 200]);

    expect(await removeProductImage(s.adminA.context, s.productA)).toEqual({
      ok: true,
      changed: true,
    });
    expect(await storedRows(s.orgA)).toEqual([]);
    expect(await removeProductImage(s.adminA.context, s.productA)).toEqual({
      ok: true,
      changed: false,
    });
  });

  it("AC-6: cada cambio se audita con el hash corto y el tamaño, nunca con los bytes", async () => {
    const s = await seed();
    await put(s.productA, s.adminA.token, await jpeg());
    await put(
      s.productA,
      s.adminA.token,
      await jpeg(800, 800, { r: 200, g: 200, b: 10 }),
    );
    await removeProductImage(s.adminA.context, s.productA);

    const audits = await imageAudits();
    expect(audits.map((row) => row.action)).toEqual([
      "update",
      "update",
      "update",
    ]);
    const label = /^[0-9a-f]{8}, \d+ KB$/;
    expect(audits[0]!.diff.before.image).toBeNull();
    expect(audits[0]!.diff.after.image).toMatch(label);
    expect(audits[1]!.diff.before.image).toBe(audits[0]!.diff.after.image);
    expect(audits[1]!.diff.after.image).toMatch(label);
    expect(audits[2]!.diff.after.image).toBeNull();
    for (const row of audits) {
      expect(JSON.stringify(row.diff).length).toBeLessThan(120);
    }

    const history = await listProductAudit(s.adminA.context, s.productA, 1);
    expect(history.ok && history.entries).toHaveLength(3);
  });
});

describe("rechazos antes de leer el cuerpo (AC-3, invariante 2)", () => {
  it("sin sesión, viewer, otro Origin, sin Origin, producto ajeno o inexistente: no se lee el cuerpo ni se escribe", async () => {
    const s = await seed();
    const bytes = await jpeg();
    const cases = [
      {
        name: "sin sesión",
        r: await put(s.productA, undefined, bytes),
        status: 401,
      },
      {
        name: "viewer",
        r: await put(s.productA, s.viewerA.token, bytes),
        status: 403,
      },
      {
        name: "otro Origin",
        r: await put(s.productA, s.adminA.token, bytes, {
          origin: "https://otro.example",
        }),
        status: 403,
      },
      {
        name: "sin Origin",
        r: await put(s.productA, s.adminA.token, bytes, { origin: null }),
        status: 403,
      },
      {
        name: "ajeno",
        r: await put(s.productB, s.adminA.token, bytes),
        status: 404,
      },
      {
        name: "inexistente",
        r: await put(
          "00000000-0000-4000-8000-000000000000",
          s.adminA.token,
          bytes,
        ),
        status: 404,
      },
      {
        name: "id inválido",
        r: await put("no-es-un-id", s.adminA.token, bytes),
        status: 404,
      },
      {
        name: "sin Content-Length",
        r: await put(s.productA, s.adminA.token, bytes, {
          contentLength: null,
        }),
        status: 411,
      },
      {
        name: "Content-Length de más de 5 MB",
        r: await put(s.productA, s.adminA.token, bytes, {
          contentLength: String(5 * 1024 * 1024 + 1),
        }),
        status: 413,
      },
    ];
    for (const { name, r, status } of cases) {
      expect([name, r.status, r.wasRead]).toEqual([name, status, false]);
    }
    expect(await storedRows(s.orgA)).toEqual([]);
    expect(await storedRows(s.orgB)).toEqual([]);
  });

  it("un Content-Length que miente no deja pasar más de 5 MB", async () => {
    const s = await seed();
    const big = new Uint8Array(5 * 1024 * 1024 + 10);
    const r = await put(s.productA, s.adminA.token, big, {
      contentLength: "1000",
    });
    expect(r.status).toBe(413);
    expect(r.body.error).toBe("too_large");
    expect(await storedRows(s.orgA)).toEqual([]);
  });

  it("SVG, texto, más de 40 megapíxeles y animada dan error en su campo, sin escribir", async () => {
    const s = await seed();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );
    const huge = await sharp({
      create: { width: 8000, height: 5100, channels: 3, background: "#123" },
    })
      .png()
      .toBuffer();
    const frame = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    const other = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#00f" },
    })
      .png()
      .toBuffer();
    // Con dos cuadros iguales el codificador los funde en uno, y la imagen ya no es animada.
    const animated = await sharp([frame, other], { join: { animated: true } })
      .webp()
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    for (const [bytes, error] of [
      [svg, "unsupported_format"],
      [Buffer.from("no es una imagen"), "unreadable"],
      [huge, "too_many_pixels"],
      [animated, "animated"],
    ] as const) {
      const r = await put(s.productA, s.adminA.token, bytes);
      expect([r.status, r.body.error]).toEqual([400, error]);
    }
    expect(await storedRows(s.orgA)).toEqual([]);
    expect(await imageAudits()).toEqual([]);
  });
});

describe("concurrencia y límite de tasa (AC-4)", () => {
  it("con el procesamiento ocupado, una subida espera su turno y la siguiente recibe 503", async () => {
    const s = await seed();
    let release!: () => void;
    const holder = withImageSlot(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const bytes = await jpeg(400, 300);
    const waiting = put(s.productA, s.adminA.token, bytes);
    // Que la primera llegue a la espera antes de mandar la segunda.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const rejected = await put(s.otherA, s.adminA.token, bytes);
    expect(rejected.status).toBe(503);
    expect(rejected.body.error).toBe("busy");
    expect(Number(rejected.retryAfter)).toBeGreaterThan(0);

    release();
    await holder;
    expect((await waiting).status).toBe(200);
    expect((await storedRows(s.orgA)).map((row) => row.product_id)).toEqual([
      s.productA,
    ]);
  });

  it("la subida 21 de un usuario en 10 minutos recibe 429, sin leer el cuerpo; las viejas y las bajas no cuentan", async () => {
    const s = await seed();
    const userId = s.adminA.context.userId;
    const audit = (minutesAgo: number, after: string | null, count: number) =>
      getDb().execute(
        sql`insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff, created_at)
            select ${s.orgA}, ${userId}, 'product', ${s.productA}, 'update',
                   jsonb_build_object('before', jsonb_build_object('image', null),
                                      'after', jsonb_build_object('image', ${after}::text)),
                   now() - make_interval(mins => ${minutesAgo})
            from generate_series(1, ${count})`,
      );
    await audit(11, "viejo, 1 KB", 5);
    await audit(2, null, 5);
    await audit(3, "a1b2c3d4, 10 KB", IMAGE_UPLOAD_RATE.uploads - 1);
    const bytes = await jpeg(400, 300);

    expect((await put(s.productA, s.adminA.token, bytes)).status).toBe(200);
    const limited = await put(s.productA, s.adminA.token, bytes);
    expect(limited.status).toBe(429);
    expect(limited.wasRead).toBe(false);
    // La más vieja de la ventana tiene 3 minutos: sale en unos 7.
    expect(Number(limited.retryAfter)).toBeGreaterThan(6 * 60);
    expect(Number(limited.retryAfter)).toBeLessThanOrEqual(7 * 60);

    // El límite es por usuario: otro admin de otra organización sube igual.
    expect((await put(s.productB, s.adminB.token, bytes)).status).toBe(200);
  });
});

describe("la ruta que sirve (AC-5) y el aislamiento (invariante 4)", () => {
  it("AC-5: devuelve el JPEG con su ETag, caché privada por la versión, nosniff y 304", async () => {
    const s = await seed();
    const { body } = await put(s.productA, s.adminA.token, await jpeg());
    const sha = body.sha256!;

    const current = await get(s.productA, s.viewerA.token, {
      query: `?v=${sha}`,
    });
    expect(current.status).toBe(200);
    expect(current.headers.get("content-type")).toBe("image/jpeg");
    expect(current.headers.get("etag")).toBe(`"${sha}"`);
    expect(current.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(current.headers.get("x-content-type-options")).toBe("nosniff");
    const served = Buffer.from(await current.arrayBuffer());
    expect(createHash("sha256").update(served).digest("hex")).toBe(sha);

    const stale = await get(s.productA, s.viewerA.token, { query: "?v=viejo" });
    expect(stale.headers.get("cache-control")).toBe("private, no-cache");

    const revalidated = await get(s.productA, s.viewerA.token, {
      headers: { "if-none-match": `"${sha}"` },
    });
    expect(revalidated.status).toBe(304);

    const thumbnail = await get(s.productA, s.viewerA.token, {
      variant: "thumbnail",
    });
    expect(thumbnail.status).toBe(200);
    const thumb = await sharp(
      Buffer.from(await thumbnail.arrayBuffer()),
    ).metadata();
    expect(Math.max(thumb.width, thumb.height)).toBe(400);

    expect((await get(s.productA, undefined)).status).toBe(401);
  });

  it("invariante 4: el producto de otra organización con imagen da el mismo 404 que uno sin imagen o inexistente", async () => {
    const s = await seed();
    expect((await put(s.productB, s.adminB.token, await jpeg())).status).toBe(
      200,
    );

    for (const productId of [
      s.productB,
      s.otherA,
      "00000000-0000-4000-8000-000000000000",
      "no-es-un-id",
    ]) {
      for (const variant of ["image", "thumbnail"] as const) {
        const response = await get(productId, s.adminA.token, { variant });
        expect([productId, variant, response.status]).toEqual([
          productId,
          variant,
          404,
        ]);
        expect(await response.text()).toBe("");
      }
    }

    expect(await removeProductImage(s.adminA.context, s.productB)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    const versions = await getProductImageVersions(s.adminA.context, [
      s.productA,
      s.productB,
    ]);
    expect(versions.ok && [...versions.versions.keys()]).toEqual([]);
    expect(await storedRows(s.orgB)).toHaveLength(1);
  });
});

describe("las consultas de los scripts de operación (AC-8)", () => {
  function scriptQuery(file: string, variable: string): string {
    const text = readFileSync(`deploy/production/${file}`, "utf8");
    const match = new RegExp(`^${variable}="(.+)"$`, "m").exec(text);
    if (!match) throw new Error(`${variable} no está en ${file}`);
    return match[1]!;
  }

  it("D-10: el ejercicio de restauración encuentra una imagen que no coincide con su hash", async () => {
    const s = await seed();
    await put(s.productA, s.adminA.token, await jpeg());
    await put(s.productB, s.adminB.token, await jpeg(300, 300));
    const query = scriptQuery("crm-restore-check.sh", "CONSULTA_IMAGENES");
    const altered = async () =>
      (await getDb().execute<{ count: string }>(sql.raw(query))).rows[0]!.count;

    expect(String(await altered())).toBe("0");
    await getDb().execute(
      sql`update product_images set image = image || '\\x00'::bytea
          where product_id = ${s.productB}`,
    );
    expect(String(await altered())).toBe("1");
  });

  it("D-9: el aviso de tamaño termina bien bajo el umbral y con error por encima", async () => {
    const query = scriptQuery("crm-db-size.sh", "CONSULTA_TAMANO");
    const size = (
      await getDb().execute<{ pg_database_size: string }>(sql.raw(query))
    ).rows[0]!.pg_database_size;
    expect(Number(size)).toBeGreaterThan(0);

    // El script entero, con un psql de mentira que devuelve el tamaño medido.
    const stubs = mkdtempSync(join(tmpdir(), "crm-db-size-"));
    writeFileSync(join(stubs, "psql"), `#!/usr/bin/env bash\necho ${size}\n`);
    chmodSync(join(stubs, "psql"), 0o755);
    const run = (threshold?: string) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${stubs}${delimiter}${process.env.PATH ?? ""}`,
      };
      delete env.CRM_DB_SIZE_THRESHOLD_BYTES;
      if (threshold !== undefined) env.CRM_DB_SIZE_THRESHOLD_BYTES = threshold;
      return spawnSync("bash", ["deploy/production/crm-db-size.sh"], {
        encoding: "utf8",
        env,
      });
    };

    const below = run();
    expect([below.status, below.stdout]).toEqual([
      0,
      expect.stringContaining("OK: la base ocupa"),
    ]);
    const above = run("1");
    expect([above.status, above.stderr]).toEqual([
      1,
      expect.stringContaining("por encima del umbral"),
    ]);
    expect(run("no-es-un-numero").status).toBe(2);
  });
});
