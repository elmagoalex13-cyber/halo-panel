-- Migración: campos requeridos por el runner en Ionos
-- Aplicar en Supabase SQL Editor

-- Campos para el control de reintentos de edición
ALTER TABLE library_content
  ADD COLUMN IF NOT EXISTS intentos_edicion smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiene_locucion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_detalle text,
  ADD COLUMN IF NOT EXISTS editado_en timestamptz;

-- Campos en trial_reels para el spoofer
ALTER TABLE trial_reels
  ADD COLUMN IF NOT EXISTS spoofeado_at timestamptz,
  ADD COLUMN IF NOT EXISTS pieza_origen_r2_key text,  -- r2_key de la pieza original
  ADD COLUMN IF NOT EXISTS pieza_origen_tipo text;    -- tipo_video de la pieza original

-- Índices de rendimiento para el polling del runner
CREATE INDEX IF NOT EXISTS idx_library_content_estado
  ON library_content(estado)
  WHERE estado IN ('editando', 'en_aprobacion');

CREATE INDEX IF NOT EXISTS idx_trial_reels_estado
  ON trial_reels(estado)
  WHERE estado IN ('pendiente_spoofer', 'pendiente_aprobacion');

-- Vista útil para debug del runner
CREATE OR REPLACE VIEW v_runner_queue AS
SELECT
  id,
  titulo,
  tipo_video,
  estado,
  intentos_edicion,
  recibido_at,
  editado_en,
  error_detalle
FROM library_content
WHERE estado IN ('editando', 'error_edicion')
ORDER BY recibido_at ASC;
