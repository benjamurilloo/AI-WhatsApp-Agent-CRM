import { sql, type SQL } from "drizzle-orm";
import { expect } from "vitest";
import { MOVEMENT_DIRECTION } from "@/modules/inventory";
import { getDb } from "@/shared/db";

// El invariante del saldo y las unidades (ADR 0024, punto 6; brief-29.5, D-8; brief-29.5.2, D-7). Para
// cada producto de la base:
// - un producto por unidad tiene quantity_on_hand igual a sus unidades available y reserved, y
//   quantity_reserved igual a sus reserved; cada movimiento suyo nombra su unidad;
// - cada unidad reserved está en exactamente un pedido confirmado, y cada unidad de un pedido
//   confirmado está reserved (la conciliación de la 19.3, con las unidades);
// - un producto por cantidad no tiene unidades vigentes, y ningún movimiento suyo nombra una unidad;
// - con { movements: true }, la suma de los movimientos con su signo es igual al saldo (ADR 0008).
//   Las suites que arman el saldo con SQL directo, sin movimiento, la apagan: su preparación no
//   pasa por inventory.
//
// Se corre después de cada test de las suites de inventory, purchasing y, desde la 29.5.2, orders y
// sales; desde la 29.6, también service.

// La suma con signo de los movimientos, desde MOVEMENT_DIRECTION: un tipo nuevo sin signo no compila.
export function signedMovementSum(alias = "m"): SQL {
  const incoming = Object.entries(MOVEMENT_DIRECTION)
    .filter(([, direction]) => direction === 1)
    .map(([type]) => type);
  return sql.raw(
    `sum(case when ${alias}.type::text in (${incoming.map((type) => `'${type}'`).join(", ")}) then ${alias}.quantity else -${alias}.quantity end)`,
  );
}

type Row = {
  product_id: string;
  tracking: string;
  on_hand: string;
  reserved: string;
  movements: string | null;
  held_units: number;
  reserved_units: number;
  live_units: number;
  misreserved: number;
  misplaced: number;
};

export async function expectStockInvariant(
  options: { movements: boolean } = { movements: true },
): Promise<void> {
  const result = await getDb().execute<Row>(
    sql`select p.id as product_id, p.tracking::text as tracking,
               coalesce(i.quantity_on_hand, 0)::numeric(14, 3)::text as on_hand,
               coalesce(i.quantity_reserved, 0)::numeric(14, 3)::text as reserved,
               (select ${signedMovementSum()}::numeric(14, 3)::text
                  from inventory_movements m
                 where m.organization_id = p.organization_id and m.product_id = p.id) as movements,
               (select count(*)::int from stock_units u
                 where u.organization_id = p.organization_id and u.product_id = p.id
                   and u.status::text in ('available', 'reserved')) as held_units,
               (select count(*)::int from stock_units u
                 where u.organization_id = p.organization_id and u.product_id = p.id
                   and u.status::text = 'reserved') as reserved_units,
               (select count(*)::int from stock_units u
                 where u.organization_id = p.organization_id and u.product_id = p.id
                   and (u.status::text = 'reserved') <> (
                     (select count(*) from order_line_units olu
                        join order_lines ol on ol.organization_id = olu.organization_id
                                           and ol.id = olu.order_line_id
                        join orders o on o.organization_id = ol.organization_id
                                     and o.id = ol.order_id
                       where olu.organization_id = u.organization_id and olu.unit_id = u.id
                         and o.status = 'confirmed') = 1)) as misreserved,
               (select count(*)::int from stock_units u
                 where u.organization_id = p.organization_id and u.product_id = p.id
                   and u.status <> 'written_off') as live_units,
               (select count(*)::int from inventory_movements m
                 where m.organization_id = p.organization_id and m.product_id = p.id
                   and ((p.tracking = 'unit') <> (m.unit_id is not null))) as misplaced
          from products p
          left join inventories i on i.organization_id = p.organization_id and i.product_id = p.id
         order by p.id`,
  );
  const broken = result.rows.flatMap((row) => {
    const problems: string[] = [];
    if (row.tracking === "unit") {
      if (Number(row.on_hand) !== row.held_units) {
        problems.push(
          `saldo ${row.on_hand} con ${row.held_units} unidades disponibles o reservadas`,
        );
      }
      if (Number(row.reserved) !== row.reserved_units) {
        problems.push(
          `reservado ${row.reserved} con ${row.reserved_units} unidades reservadas`,
        );
      }
      if (row.misreserved > 0) {
        problems.push(
          `${row.misreserved} unidades cuya reserva no es la de exactamente un pedido confirmado`,
        );
      }
    } else if (row.live_units > 0) {
      problems.push(
        `${row.live_units} unidades vigentes en un producto por cantidad`,
      );
    }
    if (row.misplaced > 0) {
      problems.push(`${row.misplaced} movimientos con la unidad mal puesta`);
    }
    if (
      options.movements &&
      row.movements !== null &&
      row.movements !== row.on_hand
    ) {
      problems.push(`movimientos ${row.movements} y saldo ${row.on_hand}`);
    }
    return problems.map((problem) => `${row.product_id}: ${problem}`);
  });
  expect(broken, `Invariante del saldo roto:\n${broken.join("\n")}`).toEqual(
    [],
  );
}
