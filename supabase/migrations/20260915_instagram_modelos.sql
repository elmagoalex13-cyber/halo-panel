-- Ejecutar manualmente en el SQL editor de Supabase.

ALTER TABLE modelos ADD COLUMN IF NOT EXISTS porcentaje_comision numeric DEFAULT 70;

CREATE TABLE IF NOT EXISTS cuentas_instagram (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid REFERENCES modelos(id) ON DELETE CASCADE,
  username text NOT NULL,
  url text,
  activa boolean DEFAULT true,
  metricool_blog_id text,
  metricool_estado text DEFAULT 'no_conectada',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cuentas_instagram ADD COLUMN IF NOT EXISTS metricool_blog_id text;
ALTER TABLE cuentas_instagram ADD COLUMN IF NOT EXISTS metricool_estado text DEFAULT 'no_conectada';

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

ALTER TABLE referencias_cuentas ADD COLUMN IF NOT EXISTS favorita boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS referencias_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid REFERENCES referencias_cuentas(id) ON DELETE CASCADE,
  video_url text,
  thumbnail_url text,
  descripcion text,
  visitas integer,
  likes integer,
  fecha_publicacion date,
  lo_que_pone text,
  palabras_voz integer,
  mira_camara boolean,
  frase_detectada text,
  sin_formato_marcado boolean,
  tags text[] DEFAULT '{}',
  formato_propuesto text,
  formato_confirmado text,
  estado_triaje text DEFAULT 'pendiente',
  confirmado_at timestamptz,
  scraped_at timestamptz DEFAULT now()
);

ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS lo_que_pone text;
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS palabras_voz integer;
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS mira_camara boolean;
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS frase_detectada text;
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS sin_formato_marcado boolean;
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS formato_propuesto text;
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS formato_confirmado text;
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS estado_triaje text DEFAULT 'pendiente';
ALTER TABLE referencias_videos ADD COLUMN IF NOT EXISTS confirmado_at timestamptz;

CREATE TABLE IF NOT EXISTS creator_configs (
  modelo_id uuid PRIMARY KEY REFERENCES modelos(id) ON DELETE CASCADE,
  persona_name text,
  age integer,
  origin text,
  lives_in_country text,
  lives_in_city text,
  timezone text,
  primary_language text,
  other_languages text[] DEFAULT '{}',
  regional_flavor text,
  archetype text,
  capitalization text,
  unique_details text,
  persona_lore text,
  account_context text,
  physical_description text,
  hard_limits text[] DEFAULT '{}',
  other_limits text,
  topic_limits text,
  custom_pricing_enabled boolean DEFAULT false,
  photo_min_price numeric,
  video_min_price numeric,
  video_price_per_minute numeric,
  optional_details text,
  updated_at timestamptz DEFAULT now()
);
