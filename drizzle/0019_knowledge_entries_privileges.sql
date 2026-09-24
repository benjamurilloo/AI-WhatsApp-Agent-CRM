-- Privilegios de knowledge_entries (brief-11.2, D-4; ADR 0013). Sin DELETE: ninguna entrada se
-- borra, se desactiva.
GRANT SELECT, INSERT, UPDATE ON TABLE knowledge_entries TO crm_app;
