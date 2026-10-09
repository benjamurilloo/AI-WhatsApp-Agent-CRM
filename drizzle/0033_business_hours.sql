ALTER TYPE "public"."audit_entity_type" ADD VALUE 'business_hours';--> statement-breakpoint
CREATE TABLE "business_hour_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"date" date NOT NULL,
	"opens_1" time,
	"closes_1" time,
	"opens_2" time,
	"closes_2" time,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_hour_exceptions_reason_length" CHECK (char_length("business_hour_exceptions"."reason") between 1 and 100),
	CONSTRAINT "business_hour_exceptions_slot_1_complete" CHECK (("business_hour_exceptions"."opens_1" is null) = ("business_hour_exceptions"."closes_1" is null)),
	CONSTRAINT "business_hour_exceptions_slot_2_complete" CHECK (("business_hour_exceptions"."opens_2" is null) = ("business_hour_exceptions"."closes_2" is null)),
	CONSTRAINT "business_hour_exceptions_slot_2_after_1" CHECK ("business_hour_exceptions"."opens_2" is null or ("business_hour_exceptions"."opens_1" is not null and "business_hour_exceptions"."opens_2" > "business_hour_exceptions"."closes_1")),
	CONSTRAINT "business_hour_exceptions_slot_1_order" CHECK ("business_hour_exceptions"."opens_1" < "business_hour_exceptions"."closes_1"),
	CONSTRAINT "business_hour_exceptions_slot_2_order" CHECK ("business_hour_exceptions"."opens_2" < "business_hour_exceptions"."closes_2"),
	CONSTRAINT "business_hour_exceptions_whole_minutes" CHECK (extract(second from "business_hour_exceptions"."opens_1") = 0 and extract(second from "business_hour_exceptions"."closes_1") = 0 and extract(second from "business_hour_exceptions"."opens_2") = 0 and extract(second from "business_hour_exceptions"."closes_2") = 0)
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_1" time,
	"closes_1" time,
	"opens_2" time,
	"closes_2" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_hours_weekday_range" CHECK ("business_hours"."weekday" between 1 and 7),
	CONSTRAINT "business_hours_slot_1_complete" CHECK (("business_hours"."opens_1" is null) = ("business_hours"."closes_1" is null)),
	CONSTRAINT "business_hours_slot_2_complete" CHECK (("business_hours"."opens_2" is null) = ("business_hours"."closes_2" is null)),
	CONSTRAINT "business_hours_slot_2_after_1" CHECK ("business_hours"."opens_2" is null or ("business_hours"."opens_1" is not null and "business_hours"."opens_2" > "business_hours"."closes_1")),
	CONSTRAINT "business_hours_slot_1_order" CHECK ("business_hours"."opens_1" < "business_hours"."closes_1"),
	CONSTRAINT "business_hours_slot_2_order" CHECK ("business_hours"."opens_2" < "business_hours"."closes_2"),
	CONSTRAINT "business_hours_whole_minutes" CHECK (extract(second from "business_hours"."opens_1") = 0 and extract(second from "business_hours"."closes_1") = 0 and extract(second from "business_hours"."opens_2") = 0 and extract(second from "business_hours"."closes_2") = 0)
);
--> statement-breakpoint
ALTER TABLE "business_hour_exceptions" ADD CONSTRAINT "business_hour_exceptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_hour_exceptions_organization_date_unique" ON "business_hour_exceptions" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "business_hours_organization_weekday_unique" ON "business_hours" USING btree ("organization_id","weekday");--> statement-breakpoint
-- Privilegios del horario (brief-17.4, D-3; ADR 0013). El semanal se escribe y se actualiza, nunca
-- se borra: sin DELETE. Una excepción se crea y se quita, nunca se edita: sin UPDATE, como
-- client_tag_assignments.
GRANT SELECT, INSERT, UPDATE ON TABLE business_hours TO crm_app;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE business_hour_exceptions TO crm_app;
