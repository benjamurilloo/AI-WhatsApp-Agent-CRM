import { handleAppointmentSlotsV3 } from "./handler";

// GET /api/read/v3/appointment-slots (contrato de lectura v3, brief-29.10.2).
export function GET(request: Request): Promise<Response> {
  return handleAppointmentSlotsV3(request);
}
