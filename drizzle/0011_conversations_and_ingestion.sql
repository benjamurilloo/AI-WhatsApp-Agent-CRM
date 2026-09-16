CREATE TYPE "public"."conversation_channel" AS ENUM('whatsapp');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'pending', 'closed');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."ingestion_event_status" AS ENUM('received', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid,
	"channel" "conversation_channel" NOT NULL,
	"external_ref" text,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "conversations_external_ref_not_blank" CHECK (btrim("conversations"."external_ref") <> ''),
	CONSTRAINT "conversations_last_message_after_start" CHECK ("conversations"."last_message_at" IS NULL OR "conversations"."last_message_at" >= "conversations"."started_at")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"external_ref" text,
	"sent_at" timestamp with time zone NOT NULL,
	"body_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_external_ref_not_blank" CHECK (btrim("messages"."external_ref") <> '')
);
--> statement-breakpoint
CREATE TABLE "ingestion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_ref" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "ingestion_event_status" DEFAULT 'received' NOT NULL,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "ingestion_events_organization_source_external_ref_unique" UNIQUE("organization_id","source","external_ref"),
	CONSTRAINT "ingestion_events_identity_not_blank" CHECK (btrim("ingestion_events"."source") <> '' AND btrim("ingestion_events"."external_ref") <> '' AND btrim("ingestion_events"."event_type") <> '' AND btrim("ingestion_events"."payload_hash") <> ''),
	CONSTRAINT "ingestion_events_processed_at_matches_status" CHECK (("ingestion_events"."status" = 'received') = ("ingestion_events"."processed_at" IS NULL)),
	CONSTRAINT "ingestion_events_error_code_matches_status" CHECK (("ingestion_events"."status" = 'failed') = ("ingestion_events"."error_code" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_events" ADD CONSTRAINT "ingestion_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_organization_channel_external_ref_unique" ON "conversations" USING btree ("organization_id","channel","external_ref") WHERE "conversations"."external_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_organization_last_message_idx" ON "conversations" USING btree ("organization_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_organization_client_last_message_idx" ON "conversations" USING btree ("organization_id","client_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_organization_started_idx" ON "conversations" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_organization_conversation_external_ref_unique" ON "messages" USING btree ("organization_id","conversation_id","external_ref") WHERE "messages"."external_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_conversation_sent_idx" ON "messages" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "messages_organization_sent_idx" ON "messages" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "ingestion_events_organization_received_idx" ON "ingestion_events" USING btree ("organization_id","received_at");