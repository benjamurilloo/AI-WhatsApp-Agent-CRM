-- brief-29.10.2, D-4: el turno que pide el agente lleva la credencial como autor y el evento que lo creó,
-- como el pedido de la 0038. Todos los turnos de antes tienen created_by: ninguna fila cambia.
ALTER TABLE "appointments" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "created_by_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "ingestion_event_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_credential_fk" FOREIGN KEY ("organization_id","created_by_credential_id") REFERENCES "public"."ingestion_credentials"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_ingestion_event_fk" FOREIGN KEY ("organization_id","ingestion_event_id") REFERENCES "public"."ingestion_events"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_ingestion_event_unique" UNIQUE("ingestion_event_id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_one_creator" CHECK (num_nonnulls("appointments"."created_by", "appointments"."created_by_credential_id") = 1);--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_event_iff_credential" CHECK (("appointments"."ingestion_event_id" is null) = ("appointments"."created_by_credential_id" is null));--> statement-breakpoint
-- El trigger de la 0065 con una regla más en el alta: un turno de una credencial nace pedido, y una persona
-- lo confirma (ADR 0024, punto 12). Lo demás no cambia: la comparación de la fila entera en cada
-- transición ya deja fijas las dos columnas nuevas.
CREATE OR REPLACE FUNCTION appointments_guard_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fixed text[];
  vaciado appointments;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'appointments no se borra: un turno se cancela';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text NOT IN ('requested', 'confirmed') THEN
      RAISE EXCEPTION 'un turno nace pedido o confirmado';
    END IF;
    IF NEW.created_by_credential_id IS NOT NULL AND NEW.status::text <> 'requested' THEN
      RAISE EXCEPTION 'un turno del agente nace pedido';
    END IF;
    RETURN NEW;
  END IF;
  vaciado := OLD;
  vaciado.note := NULL;
  vaciado.updated_at := NEW.updated_at;
  IF NEW IS NOT DISTINCT FROM vaciado THEN
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'appointments: sin cambio de estado no cambia nada';
  END IF;
  fixed := CASE
    WHEN OLD.status::text = 'requested' AND NEW.status::text = 'confirmed' THEN
      ARRAY['confirmed_at']
    WHEN OLD.status::text IN ('requested', 'confirmed') AND NEW.status::text = 'cancelled' THEN
      ARRAY['cancelled_at']
    WHEN OLD.status::text = 'confirmed' AND NEW.status::text = 'attended' THEN
      ARRAY['attended_at']
    WHEN OLD.status::text = 'confirmed' AND NEW.status::text = 'no_show' THEN
      ARRAY['no_show_at']
  END;
  IF fixed IS NULL THEN
    RAISE EXCEPTION 'appointments: transición % -> % no permitida', OLD.status, NEW.status;
  END IF;
  IF (to_jsonb(NEW) - fixed - 'status' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - fixed - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'appointments: la transición % -> % solo fija %', OLD.status, NEW.status, fixed;
  END IF;
  IF NEW.status::text IN ('attended', 'no_show') AND now() < OLD.starts_at THEN
    RAISE EXCEPTION 'appointments: un turno que no empezó no se marca atendido ni ausente';
  END IF;
  RETURN NEW;
END
$$;
