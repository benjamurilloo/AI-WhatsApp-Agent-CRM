-- Rol de aplicación y solo inserción de audit_logs (brief-3.6, D-2; ADR 0013).
-- Los roles son objetos del servidor: la base de desarrollo y la de test comparten crm_app,
-- así que se crea solo si no existe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO crm_app;--> statement-breakpoint
-- Cada migración que crea una tabla otorga sus privilegios a crm_app; un test falla si alguna queda sin ellos.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users, organizations, organization_members, sessions, login_attempts TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE audit_logs TO crm_app;--> statement-breakpoint
-- Segunda defensa, efectiva para cualquier rol mientras la aplicación se conecte con el dueño.
-- Usa el SQLSTATE P0001, distinto de 42501, para distinguirla del rechazo por permisos.
CREATE FUNCTION audit_logs_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER audit_logs_insert_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_change();
