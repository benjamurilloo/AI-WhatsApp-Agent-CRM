import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Aplica eslint.config.mjs real a archivos virtuales: no crea nada en disco
// (docs/architecture/RepositoryStructure.md, "Frontera entre módulos").
const eslint = new ESLint();

const cases = [
  {
    file: "src/app/interno.ts",
    code: 'import { x } from "@/modules/catalog/service"; export const a = x;',
    forbidden: true,
  },
  {
    file: "src/app/publico.ts",
    code: 'import { j } from "@/modules/crm"; export const k = j;',
    forbidden: false,
  },
  {
    file: "src/modules/catalog/http.ts",
    code: 'import { NextResponse } from "next/server"; export const b = NextResponse;',
    forbidden: true,
  },
  {
    file: "src/modules/catalog/relativa.ts",
    code: 'import { y } from "../crm/service"; export const c = y;',
    forbidden: true,
  },
  {
    file: "src/modules/crm/schema.ts",
    code: 'import { organizations } from "@/modules/organizations/schema"; export const d = organizations;',
    forbidden: false,
  },
  {
    file: "src/modules/crm/service.ts",
    code: 'import { organizations } from "@/modules/organizations/schema"; export const e = organizations;',
    forbidden: true,
  },
  {
    file: "src/modules/analytics/lectura.ts",
    code: 'import { clients } from "@/modules/crm/schema"; export const f = clients;',
    forbidden: false,
  },
  {
    file: "src/modules/analytics/repositorio.ts",
    code: 'import { repo } from "@/modules/crm/repository"; export const g = repo;',
    forbidden: true,
  },
  {
    file: "src/shared/db/modulo.ts",
    code: 'import { h } from "@/modules/crm"; export const i = h;',
    forbidden: true,
  },
  // analytics es el único módulo de dominio con un permiso extra, y por eso su bloque
  // no heredaba las prohibiciones generales: ESLint reemplaza la configuración de una
  // regla cuando otro bloque aplica a los mismos archivos (9.0.3, D-1 y D-2).
  {
    file: "src/modules/analytics/presentacion.ts",
    code: 'import { cache } from "next"; export const l = cache;',
    forbidden: true,
  },
  {
    file: "src/modules/analytics/http.ts",
    code: 'import { NextResponse } from "next/server"; export const m = NextResponse;',
    forbidden: true,
  },
  {
    file: "src/modules/analytics/pantalla.ts",
    code: 'import { periodo } from "@/app/(autenticado)/_dashboard/period"; export const n = periodo;',
    forbidden: true,
  },
  {
    file: "src/modules/analytics/usuarios.ts",
    code: 'import { users } from "@/modules/auth/schema"; export const o = users;',
    forbidden: true,
  },
  {
    file: "src/modules/analytics/conversaciones.ts",
    code: 'import { messages } from "@/modules/conversations/schema"; export const p = messages;',
    forbidden: false,
  },
  {
    file: "src/modules/analytics/ingestion.ts",
    code: 'import { ingestionEvents } from "@/modules/ingestion/schema"; export const q = ingestionEvents;',
    forbidden: false,
  },
  {
    file: "src/modules/analytics/publico.ts",
    code: 'import { r } from "@/modules/organizations"; export const s = r;',
    forbidden: false,
  },
  // El recorte de D-2 es nominal, no general: estos tres declaran una clave foránea a
  // users y tienen que seguir pudiendo (9.0.3, H-5).
  {
    file: "src/modules/audit/schema.ts",
    code: 'import { users } from "@/modules/auth/schema"; export const u = users;',
    forbidden: false,
  },
  {
    file: "src/modules/inventory/schema.ts",
    code: 'import { users } from "@/modules/auth/schema"; export const v = users;',
    forbidden: false,
  },
  {
    file: "src/modules/organizations/schema.ts",
    code: 'import { users } from "@/modules/auth/schema"; export const w = users;',
    forbidden: false,
  },
  // orders y numbering son módulos de dominio desde la 19.2 (revisión independiente, R-2).
  {
    file: "src/modules/orders/service.ts",
    code: 'import { revalidatePath } from "next/cache"; export const o1 = revalidatePath;',
    forbidden: true,
  },
  {
    file: "src/modules/orders/presentacion.ts",
    code: 'import { STATUS_LABEL } from "@/app/(autenticado)/pedidos/messages"; export const o2 = STATUS_LABEL;',
    forbidden: true,
  },
  {
    file: "src/modules/numbering/service.ts",
    code: 'import { NextResponse } from "next/server"; export const n1 = NextResponse;',
    forbidden: true,
  },
  {
    file: "src/modules/orders/schema.ts",
    code: 'import { clients } from "@/modules/crm/schema"; export const o3 = clients;',
    forbidden: false,
  },
  // sales es módulo de dominio desde la 20.2 (ADR 0021, punto 13).
  {
    file: "src/modules/sales/service.ts",
    code: 'import { redirect } from "next/navigation"; export const s1 = redirect;',
    forbidden: true,
  },
  {
    file: "src/modules/sales/presentacion.ts",
    code: 'import { NOT_AN_INVOICE_LEGEND } from "@/app/(autenticado)/ventas/messages"; export const s2 = NOT_AN_INVOICE_LEGEND;',
    forbidden: true,
  },
  {
    file: "src/modules/sales/relativa.ts",
    code: 'import { s3 } from "../orders/repository"; export const s4 = s3;',
    forbidden: true,
  },
  {
    file: "src/modules/sales/schema.ts",
    code: 'import { orders } from "@/modules/orders/schema"; export const s5 = orders;',
    forbidden: false,
  },
  // Desde la 20.3, sales descuenta el stock por la interfaz de inventory, nunca por su repositorio
  // (brief-20.3, AC-9); y las reglas de línea de src/shared/lines no importan módulos (AC-10).
  {
    file: "src/modules/sales/service.ts",
    code: 'import { sellStock } from "@/modules/inventory"; export const s6 = sellStock;',
    forbidden: false,
  },
  {
    file: "src/modules/sales/service.ts",
    code: 'import { applySale } from "@/modules/inventory/repository"; export const s7 = applySale;',
    forbidden: true,
  },
  {
    file: "src/shared/lines/rules.ts",
    code: 'import { lockProductsForOrder } from "@/modules/catalog"; export const l1 = lockProductsForOrder;',
    forbidden: true,
  },
  // cash es módulo de dominio desde la 21.2 (ADR 0022, punto 15; brief-21.2, AC-8).
  {
    file: "src/modules/cash/service.ts",
    code: 'import { revalidatePath } from "next/cache"; export const c1 = revalidatePath;',
    forbidden: true,
  },
  {
    file: "src/modules/cash/presentacion.ts",
    code: 'import { REASON_LABEL } from "@/app/(autenticado)/caja/messages"; export const c2 = REASON_LABEL;',
    forbidden: true,
  },
  {
    file: "src/modules/cash/relativa.ts",
    code: 'import { c3 } from "../numbering/repository"; export const c4 = c3;',
    forbidden: true,
  },
  {
    file: "src/modules/cash/service.ts",
    code: 'import { takeNextNumber } from "@/modules/numbering/repository"; export const c5 = takeNextNumber;',
    forbidden: true,
  },
  {
    file: "src/modules/cash/schema.ts",
    code: 'import { users } from "@/modules/auth/schema"; export const c6 = users;',
    forbidden: false,
  },
  {
    file: "src/modules/cash/service.ts",
    code: 'import { nextDocumentNumber } from "@/modules/numbering"; export const c7 = nextDocumentNumber;',
    forbidden: false,
  },
  // purchasing es módulo de dominio desde la 22.2 (ADR 0023, punto 11; brief-22.2, AC-9).
  {
    file: "src/modules/purchasing/service.ts",
    code: 'import { revalidatePath } from "next/cache"; export const p1 = revalidatePath;',
    forbidden: true,
  },
  {
    file: "src/modules/purchasing/presentacion.ts",
    code: 'import { NAME_MESSAGE } from "@/app/(autenticado)/compras/proveedores/messages"; export const p2 = NAME_MESSAGE;',
    forbidden: true,
  },
  {
    file: "src/modules/purchasing/relativa.ts",
    code: 'import { p3 } from "../crm/phone"; export const p4 = p3;',
    forbidden: true,
  },
  {
    file: "src/modules/purchasing/service.ts",
    code: 'import { normalizePhone } from "@/modules/crm/phone"; export const p5 = normalizePhone;',
    forbidden: true,
  },
  {
    file: "src/modules/purchasing/service.ts",
    code: 'import { parsePhoneInput } from "@/shared/phone"; export const p6 = parsePhoneInput;',
    forbidden: false,
  },
  {
    file: "src/modules/purchasing/schema.ts",
    code: 'import { organizations } from "@/modules/organizations/schema"; export const p7 = organizations;',
    forbidden: false,
  },
  // knowledge es módulo de dominio desde la 11.2 (AC-7); estos casos dejan esa mutación como
  // guarda permanente (N-3 de su revisión independiente, resuelta en la 11.3.2).
  {
    file: "src/modules/knowledge/service.ts",
    code: 'import { revalidatePath } from "next/cache"; export const k1 = revalidatePath;',
    forbidden: true,
  },
  {
    file: "src/modules/knowledge/relativa.ts",
    code: 'import { k2 } from "../catalog/service"; export const k3 = k2;',
    forbidden: true,
  },
  {
    file: "src/modules/knowledge/repository.ts",
    code: 'import { organizations } from "@/modules/organizations/schema"; export const k4 = organizations;',
    forbidden: true,
  },
  {
    file: "src/modules/knowledge/publico.ts",
    code: 'import { k5 } from "@/modules/organizations"; export const k6 = k5;',
    forbidden: false,
  },
  // El bloque de schema.ts está antes que el de analytics, así que para un schema.ts
  // dentro de analytics gana el de analytics, que es el último que aplica. analytics no
  // tiene tablas propias; el caso fija el orden, no una intención de dárselas (H-6).
  {
    file: "src/modules/analytics/schema.ts",
    code: 'import { users } from "@/modules/auth/schema"; export const x2 = users;',
    forbidden: true,
  },
];

describe("frontera entre módulos", () => {
  it.each(cases)(
    "$file → prohibido: $forbidden",
    async ({ file, code, forbidden }) => {
      const [result] = await eslint.lintText(code, { filePath: file });
      const violations =
        result?.messages.filter(
          (message) => message.ruleId === "no-restricted-imports",
        ) ?? [];
      expect(violations.length > 0).toBe(forbidden);
    },
  );
});
