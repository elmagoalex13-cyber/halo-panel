-- El email de una modelo era UNICO en toda la tabla, asi que una modelo eliminada (en la papelera) seguia "ocupando" su email
-- y no se podia volver a crear otra con ese mismo email (la pantalla parecia no hacer nada).
-- Ahora el email solo tiene que ser unico entre las modelos que NO estan en la papelera.

ALTER TABLE modelos DROP CONSTRAINT IF EXISTS modelos_email_key;
DROP INDEX IF EXISTS modelos_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS modelos_email_unico_activas ON modelos (email) WHERE eliminada_at IS NULL AND email IS NOT NULL;
