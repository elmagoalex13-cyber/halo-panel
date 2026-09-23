-- Adjuntos enviados desde el formulario publico de la web.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb;
