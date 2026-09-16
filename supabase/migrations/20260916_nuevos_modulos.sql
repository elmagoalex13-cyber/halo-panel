-- Migración: columnas para Biblioteca, Reparto, Calendario y Métricas
-- Ejecutar en Supabase SQL Editor

-- 1. library_content: columnas de workflow faltantes
ALTER TABLE library_content
  ADD COLUMN IF NOT EXISTS asignada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cuenta_destino_id uuid REFERENCES cuentas_instagram(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS url_publicado text,
  ADD COLUMN IF NOT EXISTS clasificacion_ia jsonb;

-- Renombrar aprobado_at y publicado_at si no existen bajo ese nombre
-- (Si la tabla tiene aprobado_en/publicado_en, crea alias)
ALTER TABLE library_content
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS publicado_at timestamptz;

-- 2. cuentas_instagram: columna para distinguir cuenta principal
ALTER TABLE cuentas_instagram
  ADD COLUMN IF NOT EXISTS es_principal boolean DEFAULT true;

-- 3. modelos: columna telegram_id para el bot
ALTER TABLE modelos
  ADD COLUMN IF NOT EXISTS telegram_id bigint;

-- 4. Índices de rendimiento para los nuevos módulos
CREATE INDEX IF NOT EXISTS idx_library_asignada ON library_content(asignada_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_cuenta_destino ON library_content(cuenta_destino_id);
CREATE INDEX IF NOT EXISTS idx_library_publicado ON library_content(publicado_at DESC);
CREATE INDEX IF NOT EXISTS idx_modelos_telegram ON modelos(telegram_id);

-- 5. Actualizar estado "recibido" para vídeos que fueron importados de R2 sin estado
UPDATE library_content
  SET estado = 'recibido'
  WHERE estado = 'en_aprobacion'
  AND recibido_at < now() - interval '24 hours'
  AND r2_key IS NOT NULL
  AND tipo_video = 'sin_clasificar';
