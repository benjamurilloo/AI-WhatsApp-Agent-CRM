// Lectura del cuerpo de un request con límite de bytes (brief-6.5.3). Rechaza por Content-Length
// antes de leer, y deja de leer en cuanto el cuerpo real supera el límite, con o sin ese encabezado.

export type ReadBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "invalid_utf8" };

export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<ReadBodyResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  if (request.body === null) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { ok: false, reason: "invalid_utf8" };
  }
}

// "application/json", con o sin parámetros como "; charset=utf-8".
export function isJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  const [type, ...parameters] = value.split(";");
  if (type?.trim().toLowerCase() !== "application/json") return false;
  return parameters.every((parameter) => {
    const [name, charset] = parameter.split("=").map((part) => part.trim());
    return (
      name?.toLowerCase() !== "charset" || charset?.toLowerCase() === "utf-8"
    );
  });
}
