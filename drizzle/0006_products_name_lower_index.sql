DROP INDEX "products_organization_name_idx";--> statement-breakpoint
CREATE INDEX "products_organization_name_lower_idx" ON "products" USING btree ("organization_id",lower("name") text_pattern_ops);