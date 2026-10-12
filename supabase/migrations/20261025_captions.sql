-- BANCO DE CAPTIONS para los posts de OnlyFans (se importa del documento de captions y se puede editar desde el panel).
--  tipo: foto (caption normal para un post con foto) | propina (pide propina u objetivo) | encuesta | plantilla (lleva [huecos] que hay que rellenar)
--  activa: solo las activas se usan para programar posts. tags: etiquetas de tema/estilo (se rellenan despues).
-- Solo las toca el servidor (service role).
CREATE TABLE IF NOT EXISTS captions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto       text NOT NULL UNIQUE,
  tipo        text NOT NULL DEFAULT 'foto' CHECK (tipo IN ('foto', 'propina', 'encuesta', 'plantilla')),
  activa      boolean NOT NULL DEFAULT true,
  tags        text[] NOT NULL DEFAULT '{}',
  origen      text NOT NULL DEFAULT 'documento',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS captions_tipo_activa_idx ON captions (tipo, activa);
ALTER TABLE captions ENABLE ROW LEVEL SECURITY;
