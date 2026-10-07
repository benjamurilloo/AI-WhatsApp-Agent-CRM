-- Privilegios de las etiquetas de clientes (brief-16.1, D-6 y D-8; ADR 0013).
-- El catálogo se edita y se desactiva, nunca se borra: sin DELETE.
GRANT SELECT, INSERT, UPDATE ON TABLE client_tags TO crm_app;--> statement-breakpoint
-- Una asignación se pone y se quita, nunca se modifica: sin UPDATE.
GRANT SELECT, INSERT, DELETE ON TABLE client_tag_assignments TO crm_app;
