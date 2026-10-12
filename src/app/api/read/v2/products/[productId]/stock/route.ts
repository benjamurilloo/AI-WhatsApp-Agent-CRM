import { handleProductStockV2 } from "./handler";

// GET /api/read/v2/products/{product_id}/stock (contrato de lectura v2, brief-19.4).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;
  return handleProductStockV2(request, productId);
}
