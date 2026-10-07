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
