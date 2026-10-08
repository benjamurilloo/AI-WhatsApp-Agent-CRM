ALTER TYPE "public"."audit_action" ADD VALUE 'note_added';--> statement-breakpoint
CREATE TABLE "conversation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"body_text" text,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "conversation_notes_body_text_valid" CHECK ("conversation_notes"."body_text" IS NULL OR ("conversation_notes"."body_text" = btrim("conversation_notes"."body_text") AND char_length("conversation_notes"."body_text") BETWEEN 1 AND 1000))
);
--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_notes_conversation_created_idx" ON "conversation_notes" USING btree ("organization_id","conversation_id","created_at" DESC NULLS LAST);