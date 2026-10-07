-- Registro de actividad de los usuarios del panel que no son el dueño (tu socio): quién hizo qué y sobre qué.
-- La tabla antigua log_agentes solo admite dos agentes fijos (runner_edicion, venuz_sync), por eso va en una tabla propia.
-- Solo la toca el servidor (service role); sin políticas, el navegador no puede leerla ni escribirla.

CREATE TABLE IF NOT EXISTS panel_actividad (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario     text NOT NULL,
  accion      text NOT NULL,
  sensible    boolean NOT NULL DEFAULT false,
  ids         text[] NOT NULL DEFAULT '{}',
  metodo      text,
  ruta        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS panel_actividad_created_idx ON panel_actividad (created_at DESC);
CREATE INDEX IF NOT EXISTS panel_actividad_usuario_idx ON panel_actividad (usuario, created_at DESC);

ALTER TABLE panel_actividad ENABLE ROW LEVEL SECURITY;
