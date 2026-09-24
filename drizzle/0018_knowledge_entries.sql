ALTER TYPE "public"."audit_entity_type" ADD VALUE 'knowledge_entry';--> statement-breakpoint
CREATE TABLE "knowledge_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', immutable_unaccent(lower("knowledge_entries"."title"))), 'A') || setweight(to_tsvector('simple', immutable_unaccent(lower("knowledge_entries"."category"))), 'B') || setweight(to_tsvector('simple', immutable_unaccent(lower("knowledge_entries"."content"))), 'C')) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_entries_title_length" CHECK (char_length("knowledge_entries"."title") between 1 and 200),
	CONSTRAINT "knowledge_entries_category_length" CHECK (char_length("knowledge_entries"."category") between 1 and 100),
	CONSTRAINT "knowledge_entries_content_length" CHECK (char_length("knowledge_entries"."content") between 1 and 4000),
	CONSTRAINT "knowledge_entries_validity_order" CHECK ("knowledge_entries"."valid_until" >= "knowledge_entries"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_entries_organization_title_lower_unique" ON "knowledge_entries" USING btree ("organization_id",lower("title"));--> statement-breakpoint
CREATE INDEX "knowledge_entries_search_idx" ON "knowledge_entries" USING gin ("search");