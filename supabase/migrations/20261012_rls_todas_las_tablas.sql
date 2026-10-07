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
