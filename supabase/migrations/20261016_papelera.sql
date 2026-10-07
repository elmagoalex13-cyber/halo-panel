-- PAPELERA Y COPIAS: nada de lo que se borra en el panel se pierde.
--
-- 1) Modelos y Vault: "borrar" pasa a ser mandar a la PAPELERA (columna eliminada_at). Desaparece para todos menos para el
--    dueño, que la ve en la papelera y puede restaurarla con todo su contenido (videos, cuentas, OnlyFans, facturacion...).
-- 2) Red de seguridad en la base de datos: si CUALQUIER fila de las tablas importantes se borra de verdad (por la app, por un
--    error o en cascada al borrar una modelo), antes de desaparecer se guarda una copia completa en papelera_filas.
--    Tambien se guarda la version anterior de una contraseña del Vault cada vez que se edita.
-- Solo la toca el servidor (service role); sin politicas, el navegador no puede leerla.

ALTER TABLE modelos     ADD COLUMN IF NOT EXISTS eliminada_at  timestamptz;
ALTER TABLE modelos     ADD COLUMN IF NOT EXISTS eliminada_por text;
ALTER TABLE vault_panel ADD COLUMN IF NOT EXISTS eliminada_at  timestamptz;
ALTER TABLE vault_panel ADD COLUMN IF NOT EXISTS eliminada_por text;

CREATE INDEX IF NOT EXISTS modelos_eliminada_idx     ON modelos (eliminada_at)     WHERE eliminada_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS vault_panel_eliminada_idx ON vault_panel (eliminada_at) WHERE eliminada_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS papelera_filas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla       text NOT NULL,
  fila        jsonb NOT NULL,
  motivo      text NOT NULL DEFAULT 'borrado',   -- 'borrado' o 'version anterior'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS papelera_filas_tabla_idx ON papelera_filas (tabla, created_at DESC);
ALTER TABLE papelera_filas ENABLE ROW LEVEL SECURITY;

-- Copia de cada fila borrada
CREATE OR REPLACE FUNCTION guardar_fila_borrada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO papelera_filas (tabla, fila, motivo) VALUES (TG_TABLE_NAME, to_jsonb(OLD), 'borrado');
  RETURN OLD;
END $$;

-- Version anterior de una contraseña del Vault (cuando cambia su valor o su nombre)
CREATE OR REPLACE FUNCTION guardar_version_vault() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.encrypted_blob IS DISTINCT FROM OLD.encrypted_blob OR NEW.iv IS DISTINCT FROM OLD.iv
     OR NEW.nombre IS DISTINCT FROM OLD.nombre OR NEW.descripcion IS DISTINCT FROM OLD.descripcion THEN
    INSERT INTO papelera_filas (tabla, fila, motivo) VALUES ('vault_panel', to_jsonb(OLD), 'version anterior');
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'modelos', 'vault_panel', 'cuentas_instagram', 'facturacion_modelos', 'library_content', 'encargos',
    'of_colecciones', 'of_archivos', 'referencias_cuentas', 'referencias_videos', 'venuz_cuentas',
    'modelo_onboarding', 'creator_configs', 'virales_propios', 'banco_frases_canciones', 'landings'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_guardar_borrado ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_guardar_borrado BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION guardar_fila_borrada()', t);
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_version_vault ON vault_panel;
CREATE TRIGGER trg_version_vault BEFORE UPDATE ON vault_panel FOR EACH ROW EXECUTE FUNCTION guardar_version_vault();
