-- EJECUTAR EN SUPABASE (SQL Editor) de una sola vez. Todo es repetible: si algo ya lo habias ejecutado, no pasa nada.
-- El RLS va el ULTIMO a proposito, para que tambien proteja la tabla panel_usuarios (contraseñas del socio).

-- ===== 20261009_onlyfans_visto.sql =====
-- Aviso de contenido nuevo de OnlyFans: se guarda cuando abres un script/pack/post en el panel.
-- Hay contenido "nuevo" si la modelo subio archivos despues de la ultima vez que lo abriste.

ALTER TABLE of_colecciones ADD COLUMN IF NOT EXISTS visto_at timestamptz;

-- ===== 20261010_panel_usuarios.sql =====
-- Usuarios adicionales del panel (socios, ayudantes...), cada uno con las secciones que NO puede ver.
-- El usuario "dueño" sigue siendo el de las variables de entorno (ADMIN_USERNAME / ADMIN_PASSWORD) y lo ve todo.
-- Las contraseñas se guardan con scrypt + sal (nunca en claro). Solo las toca el servidor (service role).

CREATE TABLE IF NOT EXISTS panel_usuarios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username          text NOT NULL UNIQUE,              -- en minusculas
  nombre            text,
  salt              text NOT NULL,
  hash              text NOT NULL,
  activo            boolean NOT NULL DEFAULT true,
  areas_denegadas   text[] NOT NULL DEFAULT ARRAY['leads'],  -- secciones que no puede ver (ver src/lib/areas.ts)
  ultimo_acceso_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE panel_usuarios ENABLE ROW LEVEL SECURITY;

-- ===== 20261011_vault_ambito.sql =====
-- Vault con dos ambitos: "privado" (solo el dueño) y "compartido" (el dueño y los usuarios del panel que tengan acceso al Vault).
-- Todo lo que ya existe pasa a PRIVADO: nada se comparte sin que lo decidas.

ALTER TABLE vault_panel
  ADD COLUMN IF NOT EXISTS ambito text NOT NULL DEFAULT 'privado';

ALTER TABLE vault_panel DROP CONSTRAINT IF EXISTS vault_panel_ambito_check;
ALTER TABLE vault_panel
  ADD CONSTRAINT vault_panel_ambito_check CHECK (ambito IN ('privado', 'compartido'));

CREATE INDEX IF NOT EXISTS vault_panel_ambito_idx ON vault_panel (ambito);

-- ===== 20261013_modelos_ambito.sql =====
-- Modelos "mias" (solo el dueño) y modelos "compartidas" (el dueño y los usuarios del panel con acceso).
-- Un usuario que no es el dueño solo ve las modelos COMPARTIDAS y todo lo que cuelga de ellas (videos, OnlyFans, cuentas,
-- facturacion...). Todas las modelos actuales pasan a ser SOLO TUYAS: nada se comparte sin que tu lo decidas.

ALTER TABLE modelos
  ADD COLUMN IF NOT EXISTS ambito text NOT NULL DEFAULT 'privado';

ALTER TABLE modelos DROP CONSTRAINT IF EXISTS modelos_ambito_check;
ALTER TABLE modelos
  ADD CONSTRAINT modelos_ambito_check CHECK (ambito IN ('privado', 'compartido'));

CREATE INDEX IF NOT EXISTS modelos_ambito_idx ON modelos (ambito);

-- ===== 20261012_rls_todas_las_tablas.sql =====
-- SEGURIDAD: activar RLS en TODAS las tablas del esquema public que aun no lo tengan.
--
-- Motivo: la clave "anon" de Supabase va dentro del JavaScript de la web (es publica por diseno). Con RLS desactivado,
-- cualquiera que la copie puede LEER y ESCRIBIR esas tablas (se comprobo con modelos, encargos, landings y referencias:
-- nombres reales, emails, telefonos, comision y portal_token de las modelos quedaban expuestos y modificables).
--
-- Es seguro para la aplicacion: todas las lecturas y escrituras de datos las hace el SERVIDOR con la clave service_role,
-- que se salta RLS. El navegador solo usa la clave anon para subir archivos con URL firmada (Storage, otro esquema) y para
-- Realtime (que ya no entregaba eventos de las tablas protegidas). Sin politicas = el navegador no puede tocar nada.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    RAISE NOTICE 'RLS activado en %', r.tablename;
  END LOOP;
END $$;

-- Comprobacion: debe devolver 0 filas
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;

-- ===== 20261014_cerrar_tablas_expuestas.sql =====
-- SEGURIDAD (segunda pasada): tras activar RLS, estas tablas seguian legibles con la clave publica "anon":
-- modelos, encargos, referencias, referencias_cuentas, referencias_videos, creator_configs, landings, landing_events.
-- Causa: tienen RLS activado pero con una politica abierta ("FOR ALL USING (true)"), que deja pasar a cualquiera.
--
-- Es seguro para la aplicacion: TODAS las lecturas/escrituras las hace el servidor con la clave service_role, que se
-- salta RLS y las politicas. El navegador no necesita ninguna politica sobre el esquema public.

-- 1) RLS activado en todas las tablas
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- 2) Fuera TODAS las politicas del esquema public (sin politicas = el navegador no puede tocar nada)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Politica eliminada: %.%', r.tablename, r.policyname;
  END LOOP;
END $$;

-- Comprobacion: las dos deben devolver 0 filas
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- ===== 20261015_panel_actividad.sql =====
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

-- ===== 20261016_papelera.sql =====
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
