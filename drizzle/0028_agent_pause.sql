ALTER TYPE "public"."audit_action" ADD VALUE 'agent_pause_change';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "agent_paused_at" timestamp with time zone;