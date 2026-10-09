import { readSessionToken } from "@/modules/auth";
import { handleImageFile, handleImageUpload } from "./handler";

// La imagen principal de un producto (brief-17.5, D-2 y D-6): GET la sirve con sesión y PUT la
// sube o la reemplaza, solo un admin y con el Origin del CRM.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;
  return handleImageFile(request, productId, "image", await readSessionToken());
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;
  return handleImageUpload(request, productId, await readSessionToken());
}
