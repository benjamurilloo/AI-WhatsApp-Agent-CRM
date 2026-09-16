-- Privilegios de conversaciones e ingestión y protección de messages e ingestion_events
-- (brief-6.1, D-3; ADR 0013). crm_app ya existe desde la 0003.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE conversations TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE messages TO crm_app;--> statement-breakpoint
-- El estado del evento cambia (6.5.2); el evento no se borra.
GRANT SELECT, INSERT, UPDATE ON TABLE ingestion_events TO crm_app;--> statement-breakpoint
-- Segunda defensa, efectiva para cualquier rol mientras la aplicación se conecte con el dueño.
-- Usa el SQLSTATE P0001, distinto de 42501, para distinguirla del rechazo por permisos.
CREATE FUNCTION messages_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'messages es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER messages_insert_only
BEFORE UPDATE OR DELETE ON messages
FOR EACH ROW EXECUTE FUNCTION messages_reject_change();--> statement-breakpoint
-- Si cambia la identidad de un evento, el registro deja de detectar sus reenvíos (FR-CONV-04).
CREATE FUNCTION ingestion_events_protect_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ingestion_events no admite DELETE';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.external_ref IS DISTINCT FROM OLD.external_ref
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.received_at IS DISTINCT FROM OLD.received_at THEN
    RAISE EXCEPTION 'ingestion_events: la identidad del evento no se modifica';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER ingestion_events_identity_immutable
BEFORE UPDATE OR DELETE ON ingestion_events
FOR EACH ROW EXECUTE FUNCTION ingestion_events_protect_identity();
