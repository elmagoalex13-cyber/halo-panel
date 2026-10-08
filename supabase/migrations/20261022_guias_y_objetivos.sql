-- GUIAS PARA LAS MODELOS + OBJETIVOS DE CAPTACION DE ONLYFANS
--
-- 1) Objetivos por modelo para poder crearle la cuenta de Instagram, ademas de los reels (objetivo_videos = 30):
--    4 scripts completos y bien hechos (aprobados por la agencia), 5 packs de fotos y 30 posts de OnlyFans.
--    Las modelos que ya estan en captacion reciben estos valores.
-- 2) Revision de la agencia sobre scripts, packs y posts (aprobado / mejorar + comentario); la modelo la ve en su portal.
-- 3) Referencias (fotos y videos de ejemplo) que la agencia sube para que las modelos vean como deben ser los posts y los packs.
-- Los textos de las guias de packs y posts se guardan en panel_config (claves guia_pack y guia_post).
-- Solo las toca el servidor (service role).

ALTER TABLE modelos ADD COLUMN IF NOT EXISTS objetivo_scripts integer;
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS objetivo_packs   integer;
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS objetivo_posts   integer;

UPDATE modelos
   SET objetivo_scripts = COALESCE(objetivo_scripts, 4),
       objetivo_packs   = COALESCE(objetivo_packs, 5),
       objetivo_posts   = COALESCE(objetivo_posts, 30)
 WHERE objetivo_videos IS NOT NULL;

ALTER TABLE of_colecciones ADD COLUMN IF NOT EXISTS revision       text;          -- 'aprobado' | 'mejorar'
ALTER TABLE of_colecciones ADD COLUMN IF NOT EXISTS revision_texto text;
ALTER TABLE of_colecciones ADD COLUMN IF NOT EXISTS revision_at    timestamptz;

CREATE TABLE IF NOT EXISTS of_referencias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria     text NOT NULL,                 -- 'post' | 'pack' | 'script_ejemplo'
  titulo        text,
  nota          text,
  storage_key   text NOT NULL,
  bucket        text,
  mime          text,
  size_bytes    bigint,
  tipo_archivo  text NOT NULL DEFAULT 'foto',  -- 'foto' | 'video'
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS of_referencias_categoria_idx ON of_referencias (categoria, created_at DESC);
ALTER TABLE of_referencias ENABLE ROW LEVEL SECURITY;
