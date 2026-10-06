-- Contenido de OnlyFans por modelo: scripts (8 fases), packs y posts.
-- Las modelos lo suben desde su portal (ordenado por fase) y se descarga desde el panel tal cual (sin recomprimir).
--
-- of_colecciones  un script, un pack o un post de una modelo
-- of_archivos     cada foto/video subido; en los scripts lleva fase (1-8) y hueco (video, foto, foto_relajada...)
--
-- Solo las toca el servidor (service role); RLS activado sin politicas. Los archivos estan en R2
-- (onlyfans/<modelo>/<coleccion>/<uuid>.<ext>), nunca en una URL publica de uso normal: se descargan con enlaces firmados.

CREATE TABLE IF NOT EXISTS of_colecciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id      uuid NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('script','pack','post')),
  nombre         text NOT NULL,                       -- "Script 1", "Pack ducha", "Post del lunes"
  descripcion    text,                                -- de que va el pack / caption o idea del post
  estado         text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','entregado')),
  entregado_at   timestamptz,
  subido_of_at   timestamptz,                         -- packs/posts: ya subido a OnlyFans
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS of_colecciones_modelo_idx ON of_colecciones (modelo_id, tipo, created_at DESC);

CREATE TABLE IF NOT EXISTS of_archivos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleccion_id     uuid NOT NULL,
  modelo_id        uuid NOT NULL,
  fase             integer,                           -- scripts: 1..8
  slot             text,                              -- scripts: video | foto | foto_relajada | foto_explicita
  tipo_archivo     text NOT NULL CHECK (tipo_archivo IN ('video','foto')),
  orden            integer NOT NULL DEFAULT 1,
  nombre_original  text,
  mime             text,
  size_bytes       bigint,
  duracion_seg     numeric(8,2),
  bucket           text NOT NULL,
  storage_key      text NOT NULL,
  descargado_at    timestamptz,
  subido_of_at     timestamptz,                       -- ya subido a OnlyFans
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS of_archivos_coleccion_idx ON of_archivos (coleccion_id, fase, slot, orden);
CREATE INDEX IF NOT EXISTS of_archivos_modelo_idx ON of_archivos (modelo_id);

ALTER TABLE of_colecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE of_archivos ENABLE ROW LEVEL SECURITY;
