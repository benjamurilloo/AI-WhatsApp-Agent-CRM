import { handleProductDetailV2 } from "../handler";

// GET /api/read/v2/products/{product_id} (contrato de lectura v2, brief-19.4).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;
  return handleProductDetailV2(request, productId);
}
