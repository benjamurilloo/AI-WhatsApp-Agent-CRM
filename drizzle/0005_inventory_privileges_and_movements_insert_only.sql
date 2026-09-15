-- Privilegios de catálogo e inventario y solo inserción de inventory_movements (brief-4.1; ADR 0013).
-- crm_app ya existe desde la 0003.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE products, inventories TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE inventory_movements TO crm_app;--> statement-breakpoint
-- Segunda defensa, efectiva para cualquier rol mientras la aplicación se conecte con el dueño.
-- Usa el SQLSTATE P0001, distinto de 42501, para distinguirla del rechazo por permisos.
CREATE FUNCTION inventory_movements_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER inventory_movements_insert_only
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION inventory_movements_reject_change();
