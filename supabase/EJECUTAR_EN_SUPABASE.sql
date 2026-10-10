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

-- ===== 20261017_email_modelos_papelera.sql =====
-- El email de una modelo era UNICO en toda la tabla, asi que una modelo eliminada (en la papelera) seguia "ocupando" su email
-- y no se podia volver a crear otra con ese mismo email (la pantalla parecia no hacer nada).
-- Ahora el email solo tiene que ser unico entre las modelos que NO estan en la papelera.

ALTER TABLE modelos DROP CONSTRAINT IF EXISTS modelos_email_key;
DROP INDEX IF EXISTS modelos_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS modelos_email_unico_activas ON modelos (email) WHERE eliminada_at IS NULL AND email IS NOT NULL;

-- ===== 20261018_actividad_vista.sql =====
-- Marca de "visto" en la actividad de tu socio: el numero rojo del menu lateral cuenta las acciones sensibles que aun no has abierto.
ALTER TABLE panel_actividad ADD COLUMN IF NOT EXISTS vista_at timestamptz;
CREATE INDEX IF NOT EXISTS panel_actividad_nuevas_idx ON panel_actividad (created_at DESC) WHERE sensible AND vista_at IS NULL;

-- ===== 20261019_escala.sql =====
-- ESCALA (20 modelos, ~1.200-2.400 reels al mes):
--  1) panel_config: ajustes del panel (dias de retencion de originales...) y latido del editor (runner). Una fila por clave.
--  2) dashboard_piezas(): agregados por modelo calculados en la base de datos. Antes el dashboard bajaba hasta 1.000 videos
--     (el tope de Supabase) y a partir de ahi sus numeros salian mal; asi vale para cualquier volumen y es instantaneo.
-- Solo las toca el servidor (service role); el navegador no puede leer ni ejecutar nada de esto.

CREATE TABLE IF NOT EXISTS panel_config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE panel_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION dashboard_piezas(
  p_incluir            uuid[]      DEFAULT NULL,   -- solo estas modelos (NULL = todas)
  p_excluir            uuid[]      DEFAULT '{}',   -- sin estas (modelos en la papelera)
  p_ahora              timestamptz DEFAULT now(),
  p_mes_inicio         timestamptz DEFAULT date_trunc('month', now()),
  p_mes_pasado_inicio  timestamptz DEFAULT date_trunc('month', now()) - interval '1 month'
) RETURNS TABLE (
  modelo_id uuid, total bigint, editando bigint, en_aprobacion bigint, aprobado bigint, publicado bigint, rechazado bigint,
  aprobado_futuro bigint, aprobado_pasado bigint, r_pend bigint, r_proc bigint, r_err bigint,
  ult_recibido timestamptz, este_mes bigint, mes_pasado bigint, aprob_semana bigint,
  ap_semana bigint, ap_mes bigint, ap_todo bigint, co_semana bigint, co_mes bigint, co_todo bigint,
  urg_aprob bigint, urg_edit bigint, p30_total bigint, p30_aprobados bigint, p30_publicados bigint,
  trial_aprob_futuro bigint, trial_aprob_sin bigint, trial_publicados bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    lc.modelo_id,
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'en_aprobacion'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'rechazado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.publicado_at > p_ahora),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.publicado_at <= p_ahora),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando' AND lc.estado_procesamiento = 'pendiente'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando' AND lc.estado_procesamiento = 'procesando'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado_procesamiento = 'error'),
    max(lc.recibido_at) FILTER (WHERE lc.tipo IS DISTINCT FROM 5),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_mes_pasado_inicio AND lc.recibido_at < p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado IN ('aprobado','publicado') AND lc.aprobado_at >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado'  AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado'  AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado' AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado' AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'en_aprobacion' AND lc.recibido_at < p_ahora - interval '24 hours'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando'      AND lc.recibido_at < p_ahora - interval '24 hours'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_ahora - interval '30 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_ahora - interval '30 days' AND lc.estado IN ('aprobado','publicado')),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_ahora - interval '30 days' AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo = 5 AND lc.estado = 'aprobado' AND lc.publicado_at > p_ahora),
    count(*) FILTER (WHERE lc.tipo = 5 AND lc.estado = 'aprobado' AND NOT COALESCE(lc.publicado_at > p_ahora, false)),
    count(*) FILTER (WHERE lc.tipo = 5 AND lc.estado = 'publicado')
  FROM library_content lc
  WHERE (p_incluir IS NULL OR lc.modelo_id = ANY (p_incluir))
    AND (lc.modelo_id IS NULL OR NOT (lc.modelo_id = ANY (p_excluir)))
  GROUP BY lc.modelo_id
$$;

REVOKE ALL ON FUNCTION dashboard_piezas(uuid[], uuid[], timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dashboard_piezas(uuid[], uuid[], timestamptz, timestamptz, timestamptz) TO service_role;

-- ===== 20261020_captacion.sql =====
-- CAPTACION DE MODELOS + AVISOS POR TELEGRAM + BORRADO DE ARCHIVOS DE PIEZAS
--
-- 1) Captacion: una modelo con "objetivo_videos" (p. ej. 30) sube sus videos pero NO se editan hasta que la agencia aprueba el lote.
--    El aviso "crea su cuenta de Instagram" sale cuando llega al objetivo. Las modelos que se crean como compartidas nacen con 30.
-- 2) telegram_cola: cola de avisos que el editor (runner) envia al grupo de Telegram (agrupados para no saturar).
-- 3) archivos_borrados_at: pieza cuyos archivos (video editado, original, preview) se borraron a mano para liberar espacio; la fila se
--    conserva para las estadisticas pero ya no aparece en la Mesa.
-- Solo las toca el servidor (service role).

ALTER TABLE modelos ADD COLUMN IF NOT EXISTS objetivo_videos        integer;       -- NULL = sin fase de captacion
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS captacion_aprobada_at  timestamptz;   -- cuando la agencia aprobo el lote (despues se edita todo al subir)
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS umbral_avisado_at      timestamptz;   -- ya se aviso de "llego al objetivo"

ALTER TABLE library_content ADD COLUMN IF NOT EXISTS archivos_borrados_at timestamptz;

CREATE TABLE IF NOT EXISTS telegram_cola (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL,              -- subida | umbral | accesos | prueba | lote
  modelo_id   uuid,
  datos       jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  enviado_at  timestamptz
);
CREATE INDEX IF NOT EXISTS telegram_cola_pendientes_idx ON telegram_cola (created_at) WHERE enviado_at IS NULL;
ALTER TABLE telegram_cola ENABLE ROW LEVEL SECURITY;

-- La funcion del dashboard: las piezas cuyos archivos se borraron a mano no cuentan como 'aprobadas' pendientes de publicar
CREATE OR REPLACE FUNCTION dashboard_piezas(
  p_incluir            uuid[]      DEFAULT NULL,   -- solo estas modelos (NULL = todas)
  p_excluir            uuid[]      DEFAULT '{}',   -- sin estas (modelos en la papelera)
  p_ahora              timestamptz DEFAULT now(),
  p_mes_inicio         timestamptz DEFAULT date_trunc('month', now()),
  p_mes_pasado_inicio  timestamptz DEFAULT date_trunc('month', now()) - interval '1 month'
) RETURNS TABLE (
  modelo_id uuid, total bigint, editando bigint, en_aprobacion bigint, aprobado bigint, publicado bigint, rechazado bigint,
  aprobado_futuro bigint, aprobado_pasado bigint, r_pend bigint, r_proc bigint, r_err bigint,
  ult_recibido timestamptz, este_mes bigint, mes_pasado bigint, aprob_semana bigint,
  ap_semana bigint, ap_mes bigint, ap_todo bigint, co_semana bigint, co_mes bigint, co_todo bigint,
  urg_aprob bigint, urg_edit bigint, p30_total bigint, p30_aprobados bigint, p30_publicados bigint,
  trial_aprob_futuro bigint, trial_aprob_sin bigint, trial_publicados bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    lc.modelo_id,
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'en_aprobacion'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'rechazado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL AND lc.publicado_at > p_ahora),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL AND lc.publicado_at <= p_ahora),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando' AND lc.estado_procesamiento = 'pendiente'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando' AND lc.estado_procesamiento = 'procesando'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado_procesamiento = 'error'),
    max(lc.recibido_at) FILTER (WHERE lc.tipo IS DISTINCT FROM 5),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_mes_pasado_inicio AND lc.recibido_at < p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado IN ('aprobado','publicado') AND lc.aprobado_at >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL  AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL  AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado' AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado' AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'en_aprobacion' AND lc.recibido_at < p_ahora - interval '24 hours'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando'      AND lc.recibido_at < p_ahora - interval '24 hours'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_ahora - interval '30 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_ahora - interval '30 days' AND lc.estado IN ('aprobado','publicado')),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_ahora - interval '30 days' AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo = 5 AND lc.estado = 'aprobado' AND lc.publicado_at > p_ahora),
    count(*) FILTER (WHERE lc.tipo = 5 AND lc.estado = 'aprobado' AND NOT COALESCE(lc.publicado_at > p_ahora, false)),
    count(*) FILTER (WHERE lc.tipo = 5 AND lc.estado = 'publicado')
  FROM library_content lc
  WHERE (p_incluir IS NULL OR lc.modelo_id = ANY (p_incluir))
    AND (lc.modelo_id IS NULL OR NOT (lc.modelo_id = ANY (p_excluir)))
  GROUP BY lc.modelo_id
$$;

REVOKE ALL ON FUNCTION dashboard_piezas(uuid[], uuid[], timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dashboard_piezas(uuid[], uuid[], timestamptz, timestamptz, timestamptz) TO service_role;

-- ===== 20261021_feedback_captacion.sql =====
-- FEEDBACK de la agencia sobre los reels de una modelo en captacion ("va bien" / "mejorar" + comentario).
-- Lo escribe la agencia en la pestaña Captacion de la ficha de la modelo y lo ve la modelo en su portal (pestaña Subidos).
ALTER TABLE library_content ADD COLUMN IF NOT EXISTS feedback_tipo  text;         -- 'bien' | 'mejorar'
ALTER TABLE library_content ADD COLUMN IF NOT EXISTS feedback_texto text;
ALTER TABLE library_content ADD COLUMN IF NOT EXISTS feedback_at    timestamptz;

-- ===== 20261022_guias_y_objetivos.sql =====
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

-- ===== 20261023_avisos_modelos.sql =====
-- AVISOS de la agencia a las modelos ("necesitamos contenido de ..."): se envian desde el dashboard, llegan por Telegram a las que lo tienen
-- activado y quedan siempre visibles en su portal. Esta tabla es el historial (y lo que ve la modelo en su portal).
-- Solo la toca el servidor (service role).
CREATE TABLE IF NOT EXISTS avisos_modelos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id   uuid NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
  items       jsonb NOT NULL DEFAULT '[]',   -- [{ "tipo": "reels|script|pack|post|otro", "cantidad": 10 }]
  texto       text,
  creado_por  text,
  telegram    boolean NOT NULL DEFAULT false, -- la modelo tenia Telegram activado cuando se envio
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS avisos_modelos_modelo_idx ON avisos_modelos (modelo_id, created_at DESC);
ALTER TABLE avisos_modelos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 20261024_contratos.sql
-- ============================================================
-- CONTRATOS para modelos nuevas (sin crearles el portal antes): se envian por email con un enlace donde la modelo lee una explicacion
-- sencilla, ve el contrato con su nombre y la fecha, y lo firma. Solo las toca el servidor (service role).
CREATE TABLE IF NOT EXISTS contratos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token            text NOT NULL UNIQUE,                 -- el enlace que recibe la modelo (/contrato/<token>)
  nombre           text NOT NULL,                        -- nombre de la modelo tal como va en el contrato
  email            text NOT NULL,
  fecha_inicio     date NOT NULL,
  firma_agencia    text,                                 -- firma de la agencia (PNG en data URL) en el momento del envio
  estado           text NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado', 'visto', 'firmado', 'cancelado')),
  enviado_por      text,
  enviado_at       timestamptz,                          -- cuando salio el email (NULL = no se envio, solo tiene enlace)
  email_error      text,
  visto_at         timestamptz,
  firmado_at       timestamptz,
  firma_creadora   text,                                 -- firma de la modelo (PNG en data URL)
  nombre_firmante  text,
  dni              text,
  firmante_ip      text,
  firmante_ua      text,
  pdf_key          text,                                 -- PDF firmado guardado en R2 (contratos/<id>.pdf)
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contratos_estado_idx ON contratos (estado, created_at DESC);
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
