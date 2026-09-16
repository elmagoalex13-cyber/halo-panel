-- ============================================================
-- MIGRACIONES COMPLETAS — HALO PANEL
-- Pegar todo en Supabase SQL Editor y ejecutar una sola vez
-- ============================================================

-- ────────────────────────────────────────────
-- 1. NUEVOS MÓDULOS (biblioteca, reparto, etc)
-- ────────────────────────────────────────────
ALTER TABLE library_content
  ADD COLUMN IF NOT EXISTS asignada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cuenta_destino_id uuid REFERENCES cuentas_instagram(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS url_publicado text,
  ADD COLUMN IF NOT EXISTS clasificacion_ia jsonb,
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS publicado_at timestamptz;

ALTER TABLE cuentas_instagram
  ADD COLUMN IF NOT EXISTS es_principal boolean DEFAULT true;

ALTER TABLE modelos
  ADD COLUMN IF NOT EXISTS telegram_id bigint;

CREATE INDEX IF NOT EXISTS idx_library_asignada ON library_content(asignada_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_cuenta_destino ON library_content(cuenta_destino_id);
CREATE INDEX IF NOT EXISTS idx_library_publicado ON library_content(publicado_at DESC);
CREATE INDEX IF NOT EXISTS idx_modelos_telegram ON modelos(telegram_id);

-- ────────────────────────────────────────────
-- 2. FLUJO COMPLETO (portal de modelos)
-- ────────────────────────────────────────────
ALTER TABLE modelos
  ADD COLUMN IF NOT EXISTS portal_token text UNIQUE;

-- Generar tokens para modelos que no tengan
UPDATE modelos SET portal_token = gen_random_uuid()::text WHERE portal_token IS NULL;

CREATE TABLE IF NOT EXISTS asignaciones_modelo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'referencia',
  r2_key_referencia text,
  url_referencia_ig text,
  instrucciones text,
  estado text NOT NULL DEFAULT 'pendiente',
  library_content_id uuid REFERENCES library_content(id) ON DELETE SET NULL,
  creado_en timestamptz DEFAULT now(),
  completado_en timestamptz
);

CREATE INDEX IF NOT EXISTS idx_asign_modelo ON asignaciones_modelo(modelo_id, estado);

ALTER TABLE library_content
  ADD COLUMN IF NOT EXISTS asignacion_id uuid REFERENCES asignaciones_modelo(id) ON DELETE SET NULL;

ALTER TABLE asignaciones_modelo ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignaciones_modelo FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON asignaciones_modelo;
CREATE POLICY "service_role_all" ON asignaciones_modelo
  FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────
-- 3. BANCO DE FRASES + R2 ORIGINAL
-- ────────────────────────────────────────────
ALTER TABLE banco_frases_canciones
  ADD COLUMN IF NOT EXISTS origen text DEFAULT 'bot';

ALTER TABLE library_content
  ADD COLUMN IF NOT EXISTS r2_key_original text;

UPDATE library_content
  SET r2_key_original = r2_key
  WHERE r2_key_original IS NULL AND r2_key IS NOT NULL;

-- ============================================================
-- FIN DE MIGRACIONES
-- ============================================================
