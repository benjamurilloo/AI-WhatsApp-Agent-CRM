import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { PRODUCT_IMAGE_LIMITS } from "./schema";

// Procesamiento de la imagen de producto (ADR 0018, punto 4; brief-17.5, D-1 y D-4). El formato se
// reconoce por el contenido, nunca por la extensión ni por el tipo que declara el navegador. Se
// guarda solo la versión procesada: JPEG en sRGB, sin metadatos (sharp los quita salvo que se le
// pida conservarlos), a lo sumo 1600 px de lado, y su miniatura. La orientación EXIF se aplica
// antes, para que la foto no quede girada.

// El droplet tiene una CPU: libvips con un hilo y sin caché de operaciones entre imágenes.
sharp.concurrency(1);
sharp.cache(false);

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

// Fondo de una imagen con transparencia: JPEG no la tiene (H-3).
const BACKGROUND = "#ffffff";

export type ImageRejection =
  "unsupported_format" | "too_many_pixels" | "animated" | "unreadable";

export type ProcessedImage = {
  image: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  sha256: string;
};

export type ProcessResult =
  | { ok: true; processed: ProcessedImage }
  | { ok: false; reason: ImageRejection };

export async function processProductImage(
  input: Buffer,
): Promise<ProcessResult> {
  let metadata: Metadata;
  try {
    // Lee solo la cabecera: el tope de píxeles se comprueba antes de decodificar.
    metadata = await sharp(input).metadata();
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!ACCEPTED_FORMATS.has(metadata.format)) {
    return { ok: false, reason: "unsupported_format" };
  }
  if (metadata.width * metadata.height > PRODUCT_IMAGE_LIMITS.inputPixels) {
    return { ok: false, reason: "too_many_pixels" };
  }
  if ((metadata.pages ?? 1) > 1 || isAnimatedPng(input)) {
    return { ok: false, reason: "animated" };
  }

  try {
    const { data: image, info } = await sharp(input, {
      // El mismo tope, también durante la decodificación: la cabecera puede mentir.
      limitInputPixels: PRODUCT_IMAGE_LIMITS.inputPixels,
      autoOrient: true,
    })
      .resize({
        width: PRODUCT_IMAGE_LIMITS.imageSide,
        height: PRODUCT_IMAGE_LIMITS.imageSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: BACKGROUND })
      .toColourspace("srgb")
      .jpeg({ quality: 80, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer({ resolveWithObject: true });

    const thumbnail = await sharp(image)
      .resize({
        width: PRODUCT_IMAGE_LIMITS.thumbnailSide,
        height: PRODUCT_IMAGE_LIMITS.thumbnailSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();

    return {
      ok: true,
      processed: {
        image,
        thumbnail,
        width: info.width,
        height: info.height,
        sha256: createHash("sha256").update(image).digest("hex"),
      },
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

// Una PNG animada (APNG) declara un fragmento acTL antes de su primer IDAT. sharp no informa sus
// cuadros (pages queda vacío) y decodifica solo el primero, así que sin esta lectura se guardaría
// una imagen que el usuario no eligió (revisión independiente de la 17.5.1, H-3).
function isAnimatedPng(input: Buffer): boolean {
  let offset = 8;
  while (offset + 8 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("latin1", offset + 4, offset + 8);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    offset += 12 + length;
  }
  return false;
}

// Un procesamiento a la vez en el proceso (D-4): uno corre y, como mucho, uno espera su turno
// durante WAIT_MS. El resto recibe "busy" y la ruta responde 503 con Retry-After.
export const IMAGE_SLOT_WAIT_MS = 10_000;
const MAX_WAITING = 1;

let running = false;
const waiting: Array<() => void> = [];

export async function withImageSlot<T>(
  work: () => Promise<T>,
  waitMs: number = IMAGE_SLOT_WAIT_MS,
): Promise<{ ok: true; value: T } | { ok: false; reason: "busy" }> {
  if (running) {
    if (waiting.length >= MAX_WAITING) return { ok: false, reason: "busy" };
    const acquired = await new Promise<boolean>((resolve) => {
      const grant = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        const index = waiting.indexOf(grant);
        if (index !== -1) waiting.splice(index, 1);
        resolve(false);
      }, waitMs);
      waiting.push(grant);
    });
    if (!acquired) return { ok: false, reason: "busy" };
  } else {
    running = true;
  }
  try {
    return { ok: true, value: await work() };
  } finally {
    // El turno pasa al siguiente sin soltarse: running sigue en true.
    const next = waiting.shift();
    if (next) next();
    else running = false;
  }
}
