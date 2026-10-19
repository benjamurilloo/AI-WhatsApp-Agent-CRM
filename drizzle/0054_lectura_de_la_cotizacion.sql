ALTER TYPE "public"."exchange_rate_source" ADD VALUE 'dolarapi_blue';--> statement-breakpoint
ALTER TABLE "exchange_rates" ALTER COLUMN "recorded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_rate_settings" ADD COLUMN "adjustment" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_rate_settings" ADD COLUMN "last_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_rate_settings" ADD COLUMN "source_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "source_rate" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "adjustment" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "source_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_author_by_source" CHECK (("exchange_rates"."source" = 'manual') = ("exchange_rates"."recorded_by" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_reading_by_source" CHECK (("exchange_rates"."source" = 'manual' AND "exchange_rates"."source_rate" IS NULL AND "exchange_rates"."adjustment" IS NULL AND "exchange_rates"."source_observed_at" IS NULL)
        OR ("exchange_rates"."source" <> 'manual' AND "exchange_rates"."source_rate" IS NOT NULL AND "exchange_rates"."adjustment" IS NOT NULL AND "exchange_rates"."source_observed_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_source_rate_positive" CHECK ("exchange_rates"."source_rate" IS NULL OR "exchange_rates"."source_rate" > 0);--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_reading_sum" CHECK ("exchange_rates"."source_rate" IS NULL OR "exchange_rates"."rate" = "exchange_rates"."source_rate" + "exchange_rates"."adjustment");--> statement-breakpoint
-- La configuración deja de ser de solo inserción (brief-29.4.2, D-2, H-4): el admin cambia la fuente
-- y el ajuste, y el lector, last_confirmed_at. El id, la organización, la otra moneda y la fecha de
-- alta no cambian, y la fila no se borra, tampoco para el dueño. Al cambiar la fuente, el trigger
-- anota cuándo: la primera lectura después de volver a la automática guarda siempre una fila (D-5).
DROP TRIGGER exchange_rate_settings_insert_only ON exchange_rate_settings;--> statement-breakpoint
CREATE FUNCTION exchange_rate_settings_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'exchange_rate_settings no se borra: DELETE rechazado';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.quote_currency IS DISTINCT FROM OLD.quote_currency
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'exchange_rate_settings: la organización, la otra moneda y el alta no cambian';
  END IF;
  IF NEW.source IS DISTINCT FROM OLD.source THEN
    NEW.source_changed_at := clock_timestamp();
  ELSE
    NEW.source_changed_at := OLD.source_changed_at;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER exchange_rate_settings_guard_change
BEFORE UPDATE OR DELETE ON exchange_rate_settings
FOR EACH ROW EXECUTE FUNCTION exchange_rate_settings_guard_change();--> statement-breakpoint
-- crm_app cambia solo la fuente y el ajuste, por columna: last_confirmed_at lo escribe solo
-- fx_record_reading, como dueño, para que la aplicación no pueda hacer parecer reciente una
-- automática vieja (revisión independiente de la 29.4.2, B-1).
GRANT UPDATE (source, adjustment) ON TABLE exchange_rate_settings TO crm_app;--> statement-breakpoint
-- El rol del lector (ADR 0025, punto 9; brief-29.4.2, D-2). Los roles son del servidor y el dueño no
-- tiene CREATEROLE: en producción lo crea antes el superusuario, como crm_app (0003). No recibe
-- ningún privilegio sobre tablas: solo ejecuta las dos funciones de abajo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_fx_reader') THEN
    CREATE ROLE crm_fx_reader NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO crm_fx_reader;--> statement-breakpoint
-- Las organizaciones que lee el lector: fuente automática, ARS contra USD. Solo el id. plpgsql y no
-- sql: el cuerpo de una función sql se valida al crearla, y nombra el valor nuevo del enum (H-1).
CREATE FUNCTION fx_reader_targets() RETURNS TABLE (organization_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
    SELECT s.organization_id
    FROM exchange_rate_settings s
    JOIN organizations o ON o.id = s.organization_id
    WHERE s.source = 'dolarapi_blue'
      AND s.quote_currency = 'ARS'
      AND o.main_currency = 'USD'
    ORDER BY s.organization_id;
END
$$;--> statement-breakpoint
-- Una lectura de DolarAPI para una organización (ADR 0025, punto 4; brief-29.4.2, D-3 a D-5). La regla
-- entera vive acá, en una transacción y en numeric: el lector solo trae el valor como texto.
--   - «cambió o no» se mide contra la última automática guardada desde el último cambio de fuente;
--   - el límite del 10 % se mide contra la vigente (D-4);
--   - sin cambio, solo avanza last_confirmed_at; con cambio dentro del límite, se guarda la fila.
-- Devuelve inserted, confirmed, not_a_target, rejected_invalid, rejected_below_one,
-- rejected_too_large o rejected_large_change. Un rechazo no escribe nada.
CREATE FUNCTION fx_record_reading(p_organization_id uuid, p_venta text, p_observed_at timestamptz)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  settings_row record;
  venta numeric;
  new_rate numeric(18, 6);
  last_automatic numeric(18, 6);
  current_rate numeric(18, 6);
BEGIN
  SELECT s.id, s.quote_currency, s.source, s.adjustment, s.source_changed_at, o.main_currency
  INTO settings_row
  FROM exchange_rate_settings s
  JOIN organizations o ON o.id = s.organization_id
  WHERE s.organization_id = p_organization_id
  FOR UPDATE OF s;
  IF NOT FOUND
     OR settings_row.source <> 'dolarapi_blue'
     OR settings_row.quote_currency <> 'ARS'
     OR settings_row.main_currency IS DISTINCT FROM 'USD' THEN
    RETURN 'not_a_target';
  END IF;

  -- Un decimal positivo, con a lo sumo nueve dígitos enteros y seis decimales: el mismo patrón que
  -- exige el lector, repetido acá porque la función es la frontera de la credencial.
  IF p_venta IS NULL OR p_observed_at IS NULL
     OR p_venta !~ '^[0-9]{1,9}(\.[0-9]{1,6})?$' THEN
    RETURN 'rejected_invalid';
  END IF;
  venta := p_venta::numeric;
  IF venta <= 0 THEN
    RETURN 'rejected_invalid';
  END IF;
  -- numeric(18, 6) admite doce dígitos enteros, y el ajuste, otros tantos: la suma se compara antes
  -- de asignarla, para rechazar en lugar de fallar (revisión independiente de la 29.4.2, B-7).
  IF venta + settings_row.adjustment >= 1000000000000 THEN
    RETURN 'rejected_too_large';
  END IF;
  new_rate := venta + settings_row.adjustment;
  IF new_rate < 1 THEN
    RETURN 'rejected_below_one';
  END IF;

  SELECT r.rate INTO last_automatic
  FROM exchange_rates r
  WHERE r.organization_id = p_organization_id
    AND r.base_currency = settings_row.main_currency
    AND r.quote_currency = settings_row.quote_currency
    AND r.source = 'dolarapi_blue'
    AND r.recorded_at >= settings_row.source_changed_at
  ORDER BY r.recorded_at DESC, r.id DESC
  LIMIT 1;
  IF FOUND AND last_automatic = new_rate THEN
    UPDATE exchange_rate_settings SET last_confirmed_at = clock_timestamp()
    WHERE id = settings_row.id;
    RETURN 'confirmed';
  END IF;

  SELECT r.rate INTO current_rate
  FROM exchange_rates r
  WHERE r.organization_id = p_organization_id
    AND r.base_currency = settings_row.main_currency
    AND r.quote_currency = settings_row.quote_currency
  ORDER BY r.recorded_at DESC, r.id DESC
  LIMIT 1;
  IF FOUND AND abs(new_rate - current_rate) * 100 > current_rate * 10 THEN
    RETURN 'rejected_large_change';
  END IF;

  INSERT INTO exchange_rates (organization_id, base_currency, quote_currency, rate, source,
    source_rate, adjustment, source_observed_at)
  VALUES (p_organization_id, settings_row.main_currency, settings_row.quote_currency, new_rate,
    'dolarapi_blue', venta, settings_row.adjustment, p_observed_at);
  UPDATE exchange_rate_settings SET last_confirmed_at = clock_timestamp()
  WHERE id = settings_row.id;
  RETURN 'inserted';
END
$$;--> statement-breakpoint
-- Las funciones se ejecutan por defecto por PUBLIC: se revocan, y solo las ejecuta el lector.
REVOKE ALL ON FUNCTION fx_reader_targets() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION fx_record_reading(uuid, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fx_reader_targets() TO crm_fx_reader;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION fx_record_reading(uuid, text, timestamptz) TO crm_fx_reader;
