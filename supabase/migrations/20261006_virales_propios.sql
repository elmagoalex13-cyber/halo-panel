-- Virales de las cuentas de Instagram de las propias modelos (los saca la extension de Chrome).
-- Flujo: pendiente -> (tu los revisas) aprobado -> subido (ya los subiste a trial reels) | descartado.
-- Los virales de las cuentas de REFERENCIA siguen en referencias_videos (pestana "Ideas virales").
--
-- Solo la toca el servidor (service role); RLS activado sin politicas.

CREATE TABLE IF NOT EXISTS virales_propios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id          uuid NOT NULL,              -- cuentas_instagram.id
  modelo_id          uuid,
  codigo             text NOT NULL,              -- shortcode del reel en Instagram
  video_key          text,                       -- clave en R2: propios/<usuario>/<codigo>.mp4
  thumbnail_url      text,
  descripcion        text,
  vistas             bigint NOT NULL DEFAULT 0,
  likes              bigint NOT NULL DEFAULT 0,
  comentarios        bigint NOT NULL DEFAULT 0,
  compartidos        bigint NOT NULL DEFAULT 0,
  viral_score        numeric(8,3),
  mediana_cuenta     bigint,
  fecha_publicacion  timestamptz,
  estado             text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','aprobado','subido','descartado')),
  aprobado_at        timestamptz,
  subido_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, codigo)
);
CREATE INDEX IF NOT EXISTS virales_propios_estado_idx ON virales_propios (estado, fecha_publicacion DESC);

ALTER TABLE virales_propios ENABLE ROW LEVEL SECURITY;
