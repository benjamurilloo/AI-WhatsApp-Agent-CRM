CREATE TABLE "ingestion_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "ingestion_credentials_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "ingestion_credentials_not_blank" CHECK (btrim("ingestion_credentials"."source") <> '' AND btrim("ingestion_credentials"."token_hash") <> '')
);
--> statement-breakpoint
CREATE TABLE "ingestion_rate_windows" (
	"credential_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer NOT NULL,
	CONSTRAINT "ingestion_rate_windows_credential_id_window_start_pk" PRIMARY KEY("credential_id","window_start")
);
--> statement-breakpoint
ALTER TABLE "ingestion_credentials" ADD CONSTRAINT "ingestion_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_rate_windows" ADD CONSTRAINT "ingestion_rate_windows_credential_id_ingestion_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."ingestion_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_credentials_organization_id_idx" ON "ingestion_credentials" USING btree ("organization_id");