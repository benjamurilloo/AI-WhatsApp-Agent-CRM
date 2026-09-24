import { handleProductDetail } from "../handler";

// GET /api/read/v1/products/{product_id} (contrato de lectura v1, brief-11.3).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;
  return handleProductDetail(request, productId);
}
