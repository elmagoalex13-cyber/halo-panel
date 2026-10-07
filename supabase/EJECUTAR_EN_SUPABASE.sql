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

