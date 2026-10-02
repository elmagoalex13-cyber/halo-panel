-- Onboarding de creadoras (formulario del portal de modelos).
--
-- Requisito: la informacion NO se puede perder de ninguna manera. Por eso:
--  * modelo_onboarding guarda el estado actual (1 fila por modelo).
--  * modelo_onboarding_historial es APPEND-ONLY: cada guardado que cambia algo
--    deja una copia completa; un trigger impide modificarla o borrarla.
--  * modelo_onboarding no se puede borrar (trigger).
--  * Sin FOREIGN KEY a modelos a proposito: si algun dia se borra una modelo,
--    sus respuestas no se van en cascada.
-- Las filas solo las toca la API (service role); RLS activado sin politicas
-- para que la clave anon publica no pueda leer nada.

CREATE TABLE IF NOT EXISTS modelo_onboarding (
  modelo_id   uuid PRIMARY KEY,
  datos       jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado      text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviado')),
  enviado_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS modelo_onboarding_historial (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id   uuid NOT NULL,
  datos       jsonb NOT NULL,
  origen      text NOT NULL DEFAULT 'autoguardado',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS modelo_onboarding_historial_modelo_idx
  ON modelo_onboarding_historial (modelo_id, created_at DESC);

ALTER TABLE modelo_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE modelo_onboarding_historial ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION onboarding_proteger() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Las respuestas de onboarding no se pueden borrar ni reescribir en el historial (%.%)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onboarding_no_borrar ON modelo_onboarding;
CREATE TRIGGER onboarding_no_borrar
  BEFORE DELETE OR TRUNCATE ON modelo_onboarding
  FOR EACH STATEMENT EXECUTE FUNCTION onboarding_proteger();

DROP TRIGGER IF EXISTS onboarding_hist_inmutable ON modelo_onboarding_historial;
CREATE TRIGGER onboarding_hist_inmutable
  BEFORE UPDATE OR DELETE ON modelo_onboarding_historial
  FOR EACH ROW EXECUTE FUNCTION onboarding_proteger();

DROP TRIGGER IF EXISTS onboarding_hist_no_truncate ON modelo_onboarding_historial;
CREATE TRIGGER onboarding_hist_no_truncate
  BEFORE TRUNCATE ON modelo_onboarding_historial
  FOR EACH STATEMENT EXECUTE FUNCTION onboarding_proteger();
