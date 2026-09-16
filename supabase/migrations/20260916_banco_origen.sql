-- Migración: columna origen en banco_frases_canciones + r2_key_original en library_content
-- Ejecutar en Supabase SQL Editor

-- banco_frases_canciones: columna para distinguir origen (manual | bot | api)
ALTER TABLE banco_frases_canciones
  ADD COLUMN IF NOT EXISTS origen text DEFAULT 'bot';

-- library_content: columna para guardar el r2_key del bruto original (antes de editar)
ALTER TABLE library_content
  ADD COLUMN IF NOT EXISTS r2_key_original text;

-- Copiar r2_key a r2_key_original para registros existentes sin esta columna
UPDATE library_content
  SET r2_key_original = r2_key
  WHERE r2_key_original IS NULL AND r2_key IS NOT NULL;
