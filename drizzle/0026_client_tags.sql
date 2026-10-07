ALTER TYPE "public"."audit_action" ADD VALUE 'tag_change';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'client_tag';--> statement-breakpoint
CREATE TABLE "client_tag_assignments" (
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_tag_assignments_pkey" PRIMARY KEY("client_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "client_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gray' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_tags_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "client_tags_name_length" CHECK (char_length("client_tags"."name") between 1 and 40),
	CONSTRAINT "client_tags_color" CHECK (color in ('gray', 'violet', 'blue', 'green', 'amber', 'red'))
);
--> statement-breakpoint
ALTER TABLE "client_tag_assignments" ADD CONSTRAINT "client_tag_assignments_client_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tag_assignments" ADD CONSTRAINT "client_tag_assignments_tag_fk" FOREIGN KEY ("organization_id","tag_id") REFERENCES "public"."client_tags"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_tag_assignments_organization_tag_idx" ON "client_tag_assignments" USING btree ("organization_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_tags_organization_name_lower_unique" ON "client_tags" USING btree ("organization_id",lower("name"));