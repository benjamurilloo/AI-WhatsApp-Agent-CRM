import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processProductImage, withImageSlot } from "./image-processing";

// Procesamiento de la imagen de producto (brief-17.5, D-1 y D-4; AC-2 y AC-3). Las imágenes se
// generan acá: ninguna es una foto, y ninguna muestra personas.

function solid(
  width: number,
  height: number,
  background: { r: number; g: number; b: number; alpha?: number },
) {
  return sharp({
    create: {
      width,
      height,
      channels: background.alpha === undefined ? 3 : 4,
      background,
    },
  });
}

async function processed(input: Buffer) {
  const result = await processProductImage(input);
  if (!result.ok) throw new Error(`rechazada: ${result.reason}`);
  return result.processed;
}

describe("processProductImage", () => {
  it("AC-2: un JPEG con GPS y orientación se guarda como JPEG sin metadatos, girado y reducido a 1600 px", async () => {
    // 3000 × 2000 con Orientation 6: la foto se ve vertical, 2000 × 3000.
    const input = await solid(3000, 2000, { r: 20, g: 120, b: 200 })
      .jpeg()
      .withExif({
        IFD0: { Make: "Cámara de prueba" },
        IFD3: { GPSLatitudeRef: "S", GPSLatitude: "34/1 36/1 0/1" },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();
    expect(before.orientation).toBe(6);

    const image = await processed(input);
    const after = await sharp(image.image).metadata();
    expect(after.format).toBe("jpeg");
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect(after.space).toBe("srgb");
    expect(after.channels).toBe(3);
    expect([after.width, after.height]).toEqual([1067, 1600]);
    expect([image.width, image.height]).toEqual([1067, 1600]);
    expect(image.sha256).toBe(
      createHash("sha256").update(image.image).digest("hex"),
    );

    const thumbnail = await sharp(image.thumbnail).metadata();
    expect(thumbnail.format).toBe("jpeg");
    expect(thumbnail.exif).toBeUndefined();
    expect(Math.max(thumbnail.width, thumbnail.height)).toBe(400);
  });

  it("AC-2: un PNG con transparencia se aplana sobre blanco", async () => {
    const input = await solid(200, 100, { r: 0, g: 0, b: 0, alpha: 0 })
      .png()
      .toBuffer();
    const image = await processed(input);
    const { data, info } = await sharp(image.image)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    // JPEG con pérdida: casi blanco, no exacto.
    expect(Math.min(data[0]!, data[1]!, data[2]!)).toBeGreaterThan(245);
    // No se agranda una imagen chica.
    expect([image.width, image.height]).toEqual([200, 100]);
  });

  it("AC-2: un WebP se guarda como JPEG", async () => {
    const input = await solid(800, 600, { r: 200, g: 40, b: 40 })
      .webp()
      .toBuffer();
    const image = await processed(input);
    expect((await sharp(image.image).metadata()).format).toBe("jpeg");
  });

  it("AC-3: el formato se reconoce por el contenido: SVG y GIF no, y un texto no es una imagen", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    );
    expect(await processProductImage(svg)).toEqual({
      ok: false,
      reason: "unsupported_format",
    });
    const gif = await solid(10, 10, { r: 1, g: 2, b: 3 }).gif().toBuffer();
    expect(await processProductImage(gif)).toEqual({
      ok: false,
      reason: "unsupported_format",
    });
    expect(
      await processProductImage(Buffer.from("esto no es una imagen .jpg")),
    ).toEqual({ ok: false, reason: "unreadable" });
  });

  it("AC-3: una imagen de más de 40 megapíxeles se rechaza sin decodificarla", async () => {
    const input = await solid(8000, 5100, { r: 9, g: 9, b: 9 })
      .png()
      .toBuffer();
    expect(await processProductImage(input)).toEqual({
      ok: false,
      reason: "too_many_pixels",
    });
  });

  it("AC-3: una imagen animada se rechaza", async () => {
    const frame = await solid(20, 20, { r: 255, g: 0, b: 0 }).png().toBuffer();
    const other = await solid(20, 20, { r: 0, g: 0, b: 255 }).png().toBuffer();
    const animated = await sharp([frame, other], { join: { animated: true } })
      .webp({ loop: 0 })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    expect(await processProductImage(animated)).toEqual({
      ok: false,
      reason: "animated",
    });
  });
});

describe("processProductImage con una PNG animada (H-3 de la revisión)", () => {
  it("AC-3: una APNG se rechaza aunque sharp no informe sus cuadros", async () => {
    const png = await solid(20, 20, { r: 255, g: 0, b: 0 }).png().toBuffer();
    // Un acTL de dos cuadros después del IHDR (8 de la firma y 25 del IHDR), con su CRC.
    const data = Buffer.alloc(8);
    data.writeUInt32BE(2, 0);
    const type = Buffer.from("acTL", "latin1");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0);
    const apng = Buffer.concat([
      png.subarray(0, 33),
      length,
      type,
      data,
      crc,
      png.subarray(33),
    ]);
    expect((await sharp(apng).metadata()).pages).toBeUndefined();
    expect(await processProductImage(apng)).toEqual({
      ok: false,
      reason: "animated",
    });
    // La misma PNG sin el acTL se acepta.
    expect((await processProductImage(png)).ok).toBe(true);
  });
});

describe("withImageSlot (D-4)", () => {
  it("procesa de a uno: el segundo espera su turno y el tercero recibe busy", async () => {
    const order: string[] = [];
    let release!: () => void;
    const first = withImageSlot(
      () =>
        new Promise<string>((resolve) => {
          order.push("primero empieza");
          release = () => resolve("primero");
        }),
    );
    const second = withImageSlot(async () => {
      order.push("segundo empieza");
      return "segundo";
    });
    const third = await withImageSlot(async () => "tercero");
    expect(third).toEqual({ ok: false, reason: "busy" });
    expect(order).toEqual(["primero empieza"]);

    release();
    expect(await first).toEqual({ ok: true, value: "primero" });
    expect(await second).toEqual({ ok: true, value: "segundo" });
    expect(order).toEqual(["primero empieza", "segundo empieza"]);
  });

  it("el que espera más de lo permitido recibe busy, y el turno se libera igual", async () => {
    let release!: () => void;
    const first = withImageSlot(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    expect(await withImageSlot(async () => "tarde", 20)).toEqual({
      ok: false,
      reason: "busy",
    });
    release();
    await first;
    expect(await withImageSlot(async () => "libre")).toEqual({
      ok: true,
      value: "libre",
    });
  });
});
