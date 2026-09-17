-- Privilegios de las credenciales de servicio y del límite de tasa (brief-6.5.3, D-1 y D-3;
-- ADR 0013). crm_app ya existe desde la 0003.
-- Una credencial se revoca con UPDATE y no se borra: su fila documenta que existió.
GRANT SELECT, INSERT, UPDATE ON TABLE ingestion_credentials TO crm_app;--> statement-breakpoint
-- Las ventanas vencidas se borran en cada request de la credencial.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ingestion_rate_windows TO crm_app;
