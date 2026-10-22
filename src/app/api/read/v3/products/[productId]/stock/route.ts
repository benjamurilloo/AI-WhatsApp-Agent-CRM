import { handleProductStockV3 } from "./handler";

// GET /api/read/v3/products/{product_id}/stock (contrato de lectura v3, brief-29.8).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;
  return handleProductStockV3(request, productId);
}
