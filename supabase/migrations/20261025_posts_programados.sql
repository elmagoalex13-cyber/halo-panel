-- POSTS DE ONLYFANS PROGRAMADOS: cada foto de la carpeta «Posts» de una modelo se convierte en un post con su caption (lo escribe la IA,
-- tu lo revisas) y una fecha/hora. Despues se manda a la cola de Venuz. Solo las toca el servidor (service role).
--   estado: borrador (por revisar) | aprobado (listo para enviar a Venuz) | programado (ya esta en la cola de Venuz) | publicado | error | descartado
CREATE TABLE IF NOT EXISTS posts_programados (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id      uuid NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  archivo_id     uuid NOT NULL UNIQUE REFERENCES of_archivos(id) ON DELETE CASCADE,
  caption        text,
  estado         text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'aprobado', 'programado', 'publicado', 'error', 'descartado')),
  programar_para timestamptz,
  caption_motivo text,                 -- por que no hay caption (explicita, rechazada por la IA, error...)
  venuz_post_id  text,
  error          text,
  aprobado_por   text,
  aprobado_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_programados_modelo_idx ON posts_programados (modelo_id, estado, programar_para);
ALTER TABLE posts_programados ENABLE ROW LEVEL SECURITY;

-- Ajustes por modelo: cada cuantos dias se publica un post (1 = diario, 2 = dia si dia no) y si se manda a Venuz (apagado hasta que lo actives)
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS posts_cada_dias   smallint NOT NULL DEFAULT 1;
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS posts_venuz_activo boolean  NOT NULL DEFAULT false;
