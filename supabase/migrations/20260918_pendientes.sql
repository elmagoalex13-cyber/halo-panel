-- Ejecutar en el SQL Editor de Supabase (pendiente: el panel funciona sin esto, pero mejora Ideas virales).
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS confirmado_at timestamptz;
