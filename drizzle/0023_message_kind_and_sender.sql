CREATE TYPE "public"."message_kind" AS ENUM('text', 'audio', 'image', 'video', 'document', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_sender" AS ENUM('agent', 'person');--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "kind" "message_kind";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sent_by" "message_sender";--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_only_outbound" CHECK ("messages"."direction" = 'outbound' OR "messages"."sent_by" IS NULL);