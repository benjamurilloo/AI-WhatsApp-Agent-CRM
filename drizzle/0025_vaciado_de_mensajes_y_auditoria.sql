-- Vaciado de una sola dirección en messages y audit_logs (brief-13.4, D-2 y D-3; ADR 0015).
-- Reemplaza las funciones de los triggers de la 0003 y la 0012. Los triggers y los privilegios
-- de crm_app no cambian: la aplicación sigue sin UPDATE, y vacía solo el operador con el dueño.
-- La fila esperada se arma desde OLD, así que una columna nueva no queda abierta.
CREATE OR REPLACE FUNCTION messages_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  vaciada messages;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    vaciada := OLD;
    vaciada.body_text := NULL;
    vaciada.external_ref := NULL;
    IF NEW IS NOT DISTINCT FROM vaciada THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'messages es de solo inserción: % rechazado', TG_OP;
END
$$;--> statement-breakpoint
-- Solo las entradas de un cliente guardan datos de una persona del negocio.
CREATE OR REPLACE FUNCTION audit_logs_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  vaciada audit_logs;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.entity_type = 'client' THEN
    vaciada := OLD;
    vaciada.diff := '{"before": null, "after": null, "vaciado": true}'::jsonb;
    IF NEW IS NOT DISTINCT FROM vaciada THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_logs es de solo inserción: % rechazado', TG_OP;
END
$$;
