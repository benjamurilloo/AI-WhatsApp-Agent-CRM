-- Privilegios y protección de conversation_notes (brief-16.4, D-1; ADR 0013 y ADR 0015).
-- Solo inserción, como messages: una nota no se edita ni se borra. crm_app no tiene UPDATE ni
-- DELETE, y el trigger rechaza ambos para cualquier rol, salvo el vaciado del texto, que corre el
-- operador con el dueño (scripts/client-data-delete.ts --vaciar).
GRANT SELECT, INSERT ON TABLE conversation_notes TO crm_app;--> statement-breakpoint
-- La fila esperada se arma desde OLD, así que una columna nueva no queda abierta. Usa el SQLSTATE
-- P0001, distinto de 42501, para distinguirlo del rechazo por permisos.
CREATE FUNCTION conversation_notes_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  vaciada conversation_notes;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    vaciada := OLD;
    vaciada.body_text := NULL;
    IF NEW IS NOT DISTINCT FROM vaciada THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'conversation_notes es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
CREATE TRIGGER conversation_notes_insert_only
BEFORE UPDATE OR DELETE ON conversation_notes
FOR EACH ROW EXECUTE FUNCTION conversation_notes_reject_change();
