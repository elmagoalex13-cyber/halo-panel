-- Layout visual para frases con musica (tipo 2).
-- Permite guardar la estructura extraida del reel original y reutilizarla al renderizar.

ALTER TABLE banco_frases_canciones ADD COLUMN IF NOT EXISTS layout_json jsonb;
ALTER TABLE library_content ADD COLUMN IF NOT EXISTS layout_json jsonb;
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS layout_json jsonb;
