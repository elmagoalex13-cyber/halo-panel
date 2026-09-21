-- Tracking de landings externas
-- Ejecutar en Supabase SQL Editor antes de usar /api/landing-track.

CREATE TABLE IF NOT EXISTS landings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slug text NOT NULL UNIQUE,
  public_url text NOT NULL,
  landing_key text NOT NULL UNIQUE,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id uuid NOT NULL REFERENCES landings(id) ON DELETE CASCADE,
  landing_slug text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('pageview', 'click')),
  label text,
  destination text,
  session_id text NOT NULL,
  referrer text,
  page text,
  url text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE landings ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='landings' AND policyname='allow_all_landings'
  ) THEN
    CREATE POLICY allow_all_landings ON landings FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='landing_events' AND policyname='allow_all_landing_events'
  ) THEN
    CREATE POLICY allow_all_landing_events ON landing_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_landings_slug ON landings(slug);
CREATE INDEX IF NOT EXISTS idx_landings_key ON landings(landing_key);
CREATE INDEX IF NOT EXISTS idx_landing_events_landing_time ON landing_events(landing_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_events_slug_time ON landing_events(landing_slug, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_events_type_time ON landing_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_events_label ON landing_events(label);
CREATE INDEX IF NOT EXISTS idx_landing_events_session ON landing_events(session_id);

CREATE OR REPLACE VIEW landing_stats AS
SELECT
  l.id,
  l.nombre,
  l.slug,
  l.public_url,
  l.landing_key,
  l.activa,
  COUNT(e.id) FILTER (WHERE e.event_type = 'pageview')::bigint AS visitas_totales,
  COUNT(DISTINCT e.session_id) FILTER (WHERE e.event_type = 'pageview')::bigint AS visitantes_unicos,
  COUNT(e.id) FILTER (
    WHERE e.event_type = 'click'
      AND (
        e.destination ILIKE '%onlyfans%'
        OR e.label ILIKE '%onlyfans%'
        OR e.label ILIKE '%of%'
      )
  )::bigint AS clicks_onlyfans,
  CASE
    WHEN COUNT(e.id) FILTER (WHERE e.event_type = 'pageview') = 0 THEN 0
    ELSE ROUND(
      (
        COUNT(e.id) FILTER (
          WHERE e.event_type = 'click'
            AND (
              e.destination ILIKE '%onlyfans%'
              OR e.label ILIKE '%onlyfans%'
              OR e.label ILIKE '%of%'
            )
        )::numeric
        / COUNT(e.id) FILTER (WHERE e.event_type = 'pageview')::numeric
      ) * 100,
      2
    )
  END AS conversion_rate,
  MAX(e.occurred_at) AS ultima_actividad
FROM landings l
LEFT JOIN landing_events e ON e.landing_id = l.id
GROUP BY l.id;

-- Ejemplo para crear una landing:
-- INSERT INTO landings (nombre, slug, public_url, landing_key)
-- VALUES ('Rachel Sweet', 'rachel-sweet', 'https://tudominio.com/rachel-sweet', 'lk_rachel_sweet_cambia_esto')
-- ON CONFLICT (slug) DO NOTHING;
