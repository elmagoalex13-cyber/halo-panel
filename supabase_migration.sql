-- ============================================================
-- MIGRACIÓN COMPLETA HALO MODELS CRM
-- Ejecutar en Supabase SQL Editor (Dashboard > SQL Editor)
-- Segura: usa IF NOT EXISTS y ADD COLUMN IF NOT EXISTS
-- ============================================================

-- 1. TABLA: modelos
ALTER TABLE modelos
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS fecha_alta date,
  ADD COLUMN IF NOT EXISTS porcentaje_comision numeric(5,2) DEFAULT 70,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 2. TABLA: cuentas_instagram
ALTER TABLE cuentas_instagram
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS metricool_blog_id text,
  ADD COLUMN IF NOT EXISTS metricool_estado text DEFAULT 'no_conectada',
  ADD COLUMN IF NOT EXISTS seguidores integer,
  ADD COLUMN IF NOT EXISTS email_cuenta text;

-- 3. TABLA: library_content (columnas R2 + workflow)
ALTER TABLE library_content
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS r2_key text,
  ADD COLUMN IF NOT EXISTS r2_bucket text DEFAULT 'halo-videos',
  ADD COLUMN IF NOT EXISTS r2_key_referencia text,
  ADD COLUMN IF NOT EXISTS r2_key_original text,
  ADD COLUMN IF NOT EXISTS filename_original text,
  ADD COLUMN IF NOT EXISTS mimetype text DEFAULT 'video/mp4',
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS duracion_seg integer,
  ADD COLUMN IF NOT EXISTS tipo_video text DEFAULT 'sin_clasificar',
  ADD COLUMN IF NOT EXISTS notas_editor text,
  ADD COLUMN IF NOT EXISTS rechazo_motivo text,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS frase_quemada text,
  ADD COLUMN IF NOT EXISTS correcciones text,
  ADD COLUMN IF NOT EXISTS drive_url text,
  ADD COLUMN IF NOT EXISTS cuenta_id uuid REFERENCES cuentas_instagram(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recibido_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS publicado_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 4. TABLA: vault_panel
ALTER TABLE vault_panel
  ADD COLUMN IF NOT EXISTS encrypted_blob text,
  ADD COLUMN IF NOT EXISTS iv text,
  ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES modelos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'otro',
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 5. TABLA: facturacion_modelos
ALTER TABLE facturacion_modelos
  ADD COLUMN IF NOT EXISTS porcentaje_comision numeric(5,2) DEFAULT 70,
  ADD COLUMN IF NOT EXISTS suscriptores_activos integer,
  ADD COLUMN IF NOT EXISTS nuevos_suscriptores integer,
  ADD COLUMN IF NOT EXISTS bajas integer,
  ADD COLUMN IF NOT EXISTS ingresos_mensajes numeric(10,2),
  ADD COLUMN IF NOT EXISTS ingresos_tips numeric(10,2),
  ADD COLUMN IF NOT EXISTS ingresos_ppv numeric(10,2),
  ADD COLUMN IF NOT EXISTS otros_ingresos numeric(10,2),
  ADD COLUMN IF NOT EXISTS estado_cobro text DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS fecha_cobro date,
  ADD COLUMN IF NOT EXISTS cobrado_en timestamptz,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS fuente text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 6. TABLA: log_agentes
ALTER TABLE log_agentes
  ADD COLUMN IF NOT EXISTS duracion_ms integer,
  ADD COLUMN IF NOT EXISTS entidad_tipo text,
  ADD COLUMN IF NOT EXISTS entidad_id uuid;

-- 7. TABLA: banco_frases_canciones (NUEVA)
CREATE TABLE IF NOT EXISTS banco_frases_canciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frase text NOT NULL,
  cancion_nombre text NOT NULL,
  cancion_artista text,
  audio_id_ig text,
  url_referencia text,
  views_referencia bigint,
  likes_referencia bigint,
  fecha_publicacion_ref date,
  origen text DEFAULT 'manual',
  puntuacion numeric(4,2) DEFAULT 5,
  veces_usada smallint DEFAULT 0,
  activa boolean DEFAULT true,
  disponible boolean DEFAULT true,
  cuenta_referencia_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE banco_frases_canciones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='banco_frases_canciones' AND policyname='allow_all_banco_frases') THEN
    CREATE POLICY allow_all_banco_frases ON banco_frases_canciones FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 8. TABLA: cuotas (NUEVA)
CREATE TABLE IF NOT EXISTS cuotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES cuentas_instagram(id) ON DELETE CASCADE,
  tipo smallint NOT NULL,
  cantidad_semanal smallint NOT NULL DEFAULT 7,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cuotas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cuotas' AND policyname='allow_all_cuotas') THEN
    CREATE POLICY allow_all_cuotas ON cuotas FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 9. TABLA: contratos (NUEVA)
CREATE TABLE IF NOT EXISTS contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  fecha_inicio date,
  fecha_fin date,
  porcentaje_comision numeric(5,2),
  condiciones text,
  documento_url text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contratos' AND policyname='allow_all_contratos') THEN
    CREATE POLICY allow_all_contratos ON contratos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 10. TABLA: comunicaciones_modelo (NUEVA)
CREATE TABLE IF NOT EXISTS comunicaciones_modelo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  tipo text DEFAULT 'nota',
  contenido text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE comunicaciones_modelo ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comunicaciones_modelo' AND policyname='allow_all_comunicaciones') THEN
    CREATE POLICY allow_all_comunicaciones ON comunicaciones_modelo FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 11. TABLA: estilos_subtitulo (NUEVA)
CREATE TABLE IF NOT EXISTS estilos_subtitulo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid REFERENCES cuentas_instagram(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  contenido_ass text NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE estilos_subtitulo ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='estilos_subtitulo' AND policyname='allow_all_estilos') THEN
    CREATE POLICY allow_all_estilos ON estilos_subtitulo FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 12. TABLA: metricas_rendimiento (NUEVA)
CREATE TABLE IF NOT EXISTS metricas_rendimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL REFERENCES cuentas_instagram(id) ON DELETE CASCADE,
  semana date NOT NULL,
  tipo smallint,
  total_publicados smallint DEFAULT 0,
  total_views bigint DEFAULT 0,
  total_likes bigint DEFAULT 0,
  tasa_aprobacion numeric(4,2),
  created_at timestamptz DEFAULT now(),
  UNIQUE(cuenta_id, semana, tipo)
);
ALTER TABLE metricas_rendimiento ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='metricas_rendimiento' AND policyname='allow_all_metricas') THEN
    CREATE POLICY allow_all_metricas ON metricas_rendimiento FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 13. TABLA: venuz_sync_raw (NUEVA)
CREATE TABLE IF NOT EXISTS venuz_sync_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_at timestamptz DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}',
  endpoint text,
  estado text DEFAULT 'ok',
  error_detalle text
);
ALTER TABLE venuz_sync_raw ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venuz_sync_raw' AND policyname='allow_all_venuz_raw') THEN
    CREATE POLICY allow_all_venuz_raw ON venuz_sync_raw FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 14. TABLA: venuz_config (NUEVA)
CREATE TABLE IF NOT EXISTS venuz_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervalo_horas smallint DEFAULT 6,
  ultimo_sync timestamptz,
  proximo_sync timestamptz,
  activo boolean DEFAULT true,
  credenciales_cifradas text
);
ALTER TABLE venuz_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='venuz_config' AND policyname='allow_all_venuz_config') THEN
    CREATE POLICY allow_all_venuz_config ON venuz_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_library_modelo ON library_content(modelo_id);
CREATE INDEX IF NOT EXISTS idx_library_estado ON library_content(estado);
CREATE INDEX IF NOT EXISTS idx_library_cuenta ON library_content(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_library_recibido ON library_content(recibido_at DESC);
CREATE INDEX IF NOT EXISTS idx_facturacion_modelo ON facturacion_modelos(modelo_id);
CREATE INDEX IF NOT EXISTS idx_log_agente ON log_agentes(agente);
CREATE INDEX IF NOT EXISTS idx_log_created ON log_agentes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_banco_frases_activa ON banco_frases_canciones(activa);
CREATE INDEX IF NOT EXISTS idx_banco_frases_puntuacion ON banco_frases_canciones(puntuacion DESC);
CREATE INDEX IF NOT EXISTS idx_cuentas_modelo ON cuentas_instagram(modelo_id);

-- FIN

-- ============================================================
-- TABLAS ADICIONALES — SEGUNDA PARTE (añadidas en revisión)
-- ============================================================

-- =============================
-- 15. TABLA: referencias_cuentas (NUEVA)
-- =============================
CREATE TABLE IF NOT EXISTS referencias_cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  categoria text,
  notas text,
  activa boolean DEFAULT true,
  favorita boolean DEFAULT false,
  ultimo_scrape_at timestamptz,
  intervalo_dias integer DEFAULT 7,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE referencias_cuentas ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='referencias_cuentas' AND policyname='allow_all_referencias_cuentas'
  ) THEN
    CREATE POLICY allow_all_referencias_cuentas ON referencias_cuentas FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- =============================
-- 16. TABLA: referencias_videos (NUEVA)
-- =============================
CREATE TABLE IF NOT EXISTS referencias_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid REFERENCES referencias_cuentas(id) ON DELETE SET NULL,
  video_url text,
  thumbnail_url text,
  descripcion text,
  visitas bigint DEFAULT 0,
  likes bigint,
  fecha_publicacion date,
  lo_que_pone text,
  palabras_voz integer,
  mira_camara boolean,
  frase_detectada text,
  sin_formato_marcado boolean DEFAULT false,
  tags text[],
  formato_propuesto text,
  formato_confirmado text,
  estado_triaje text DEFAULT 'pendiente',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE referencias_videos ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='referencias_videos' AND policyname='allow_all_referencias_videos'
  ) THEN
    CREATE POLICY allow_all_referencias_videos ON referencias_videos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- =============================
-- 17. TABLA: creator_configs (NUEVA)
-- =============================
CREATE TABLE IF NOT EXISTS creator_configs (
  modelo_id uuid PRIMARY KEY REFERENCES modelos(id) ON DELETE CASCADE,
  persona_name text,
  age integer,
  origin text,
  lives_in_country text,
  lives_in_city text,
  timezone text,
  primary_language text,
  other_languages text[],
  regional_flavor text,
  archetype text,
  capitalization text,
  unique_details text,
  persona_lore text,
  account_context text,
  physical_description text,
  hard_limits text[],
  other_limits text,
  topic_limits text,
  custom_pricing_enabled boolean DEFAULT false,
  photo_min_price numeric(8,2),
  video_min_price numeric(8,2),
  video_price_per_minute numeric(8,2),
  optional_details text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE creator_configs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='creator_configs' AND policyname='allow_all_creator_configs'
  ) THEN
    CREATE POLICY allow_all_creator_configs ON creator_configs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Indices adicionales para tablas nuevas
CREATE INDEX IF NOT EXISTS idx_refs_cuentas_username ON referencias_cuentas(username);
CREATE INDEX IF NOT EXISTS idx_refs_videos_cuenta ON referencias_videos(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_refs_videos_estado ON referencias_videos(estado_triaje);
CREATE INDEX IF NOT EXISTS idx_refs_videos_visitas ON referencias_videos(visitas DESC);

-- ============================================================
-- FIN MIGRACION COMPLETA v2
-- ============================================================
