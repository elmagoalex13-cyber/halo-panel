-- Migración: flujo completo modelos + portal + asignaciones
-- Ejecutar en Supabase SQL Editor

-- 1. Token del portal por modelo
ALTER TABLE modelos
  ADD COLUMN IF NOT EXISTS portal_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_id bigint;

-- Generar tokens para modelos existentes (ejecutar después del alter)
UPDATE modelos SET portal_token = gen_random_uuid()::text WHERE portal_token IS NULL;

-- 2. Tabla asignaciones_modelo: lo que tú le mandas a una modelo para grabar
CREATE TABLE IF NOT EXISTS asignaciones_modelo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'referencia',  -- referencia | frase | subtitulos | libre
  r2_key_referencia text,            -- vídeo viral que tiene que imitar
  url_referencia_ig text,            -- URL de Instagram del vídeo original
  instrucciones text,                -- nota libre para la modelo
  estado text NOT NULL DEFAULT 'pendiente',  -- pendiente | completado | cancelado
  library_content_id uuid REFERENCES library_content(id) ON DELETE SET NULL,  -- el bruto que subió
  creado_en timestamptz DEFAULT now(),
  completado_en timestamptz
);

CREATE INDEX IF NOT EXISTS idx_asign_modelo ON asignaciones_modelo(modelo_id, estado);

-- 3. library_content: columnas adicionales que necesitamos
ALTER TABLE library_content
  ADD COLUMN IF NOT EXISTS asignacion_id uuid REFERENCES asignaciones_modelo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asignada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cuenta_destino_id uuid REFERENCES cuentas_instagram(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS url_publicado text,
  ADD COLUMN IF NOT EXISTS publicado_at timestamptz,
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS clasificacion_ia jsonb;

-- 4. cuentas_instagram: columna principal
ALTER TABLE cuentas_instagram
  ADD COLUMN IF NOT EXISTS es_principal boolean DEFAULT true;

-- 5. RLS: portal público (acceso solo por token)
ALTER TABLE asignaciones_modelo ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignaciones_modelo FORCE ROW LEVEL SECURITY;

-- Policy: service role bypasses RLS (nuestras API routes usan service role)
CREATE POLICY "service_role_all" ON asignaciones_modelo
  FOR ALL USING (true) WITH CHECK (true);
