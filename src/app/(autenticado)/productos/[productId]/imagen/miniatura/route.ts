import { readSessionToken } from "@/modules/auth";
import { handleImageFile } from "../handler";

// La miniatura de la imagen principal, para la lista (brief-17.5, D-6 y D-7).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;
  return handleImageFile(
    request,
    productId,
    "thumbnail",
    await readSessionToken(),
  );
}
