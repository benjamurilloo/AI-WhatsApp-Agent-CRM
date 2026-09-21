-- Búsqueda por prefijo sin distinguir acentos (brief-9.0.2). Primera extensión del proyecto.
--
-- Por qué hace falta la función de envoltura: unaccent() es STABLE, no IMMUTABLE —está declarado
-- así en la fuente de la extensión, contrib/unaccent/unaccent--1.1.sql—, y PostgreSQL solo admite
-- funciones inmutables en una expresión de índice. Sin envoltura no hay índice, y sin índice estas
-- dos búsquedas pasan a recorrer la tabla entera (brief-9.0.2, D-1).
--
-- LIMITACIÓN ACEPTADA, no un detalle: la envoltura le declara al planificador una inmutabilidad
-- que unaccent() no tiene. Es correcta mientras el diccionario `unaccent` no cambie. Si alguna vez
-- cambia —otra versión de la extensión con reglas distintas, o un diccionario propio—, los índices
-- que la usan quedan silenciosamente mal y hay que REINDEX. El diccionario se pasa explícito y
-- calificado para que no dependa del search_path de quien consulte.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
	LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint
DROP INDEX "products_organization_name_lower_idx";--> statement-breakpoint
DROP INDEX "clients_organization_display_name_lower_idx";--> statement-breakpoint
CREATE INDEX "products_organization_name_unaccent_idx" ON "products" USING btree ("organization_id",immutable_unaccent(lower("name")) text_pattern_ops);--> statement-breakpoint
CREATE INDEX "clients_organization_display_name_unaccent_idx" ON "clients" USING btree ("organization_id",immutable_unaccent(lower("display_name")) text_pattern_ops);
