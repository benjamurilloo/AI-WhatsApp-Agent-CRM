CREATE TYPE "public"."client_kind" AS ENUM('person', 'company');--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kind" "client_kind";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address_line" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "segment" text;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_email_format" CHECK ("clients"."email" = lower("clients"."email") and char_length("clients"."email") <= 254 and position('@' in "clients"."email") > 1);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_name_length" CHECK (char_length("clients"."company_name") between 1 and 120);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_job_title_length" CHECK (char_length("clients"."job_title") between 1 and 120);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_address_line_length" CHECK (char_length("clients"."address_line") between 1 and 200);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_city_length" CHECK (char_length("clients"."city") between 1 and 120);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_province" CHECK (province in ('AR-C', 'AR-B', 'AR-K', 'AR-H', 'AR-U', 'AR-X', 'AR-W', 'AR-E', 'AR-P', 'AR-Y', 'AR-L', 'AR-F', 'AR-M', 'AR-N', 'AR-Q', 'AR-R', 'AR-A', 'AR-J', 'AR-D', 'AR-Z', 'AR-S', 'AR-G', 'AR-V', 'AR-T'));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_postal_code_format" CHECK ("clients"."postal_code" ~ '^[A-Z0-9][A-Z0-9 ]{0,9}$');--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_segment_length" CHECK (char_length("clients"."segment") between 1 and 60);