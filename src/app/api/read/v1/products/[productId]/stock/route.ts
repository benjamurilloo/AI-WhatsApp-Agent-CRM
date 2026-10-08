import { handleProductStock } from "./handler";

// GET /api/read/v1/products/{product_id}/stock (contrato de lectura v1, brief-16.6).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;
  return handleProductStock(request, productId);
}
