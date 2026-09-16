-- Privilegios de clients (brief-5.1; ADR 0013). crm_app ya existe desde la 0003.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clients TO crm_app;
