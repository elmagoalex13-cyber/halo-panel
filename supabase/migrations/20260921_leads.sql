-- Recepcion y gestion de leads del formulario publico.
-- Ejecutar en Supabase SQL Editor antes de activar el envio desde la web.

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estado text NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'contactado', 'captado', 'futuro', 'descartado', 'eliminado')),
  nombre text,
  email text,
  whatsapp text,
  instagram text,
  pais text,
  experiencia text,
  ingresos text,
  necesidades text[] NOT NULL DEFAULT '{}',
  otro_mensaje text,
  acepta_privacidad boolean NOT NULL DEFAULT false,
  origen text NOT NULL DEFAULT 'web',
  landing_slug text,
  page_url text,
  referrer text,
  user_agent text,
  adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas text,
  ultimo_contacto_at timestamptz,
  seguimiento_at timestamptz,
  captado_at timestamptz,
  descartado_at timestamptz,
  eliminado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'nuevo';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS nombre text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pais text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS experiencia text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ingresos text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS necesidades text[] NOT NULL DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS otro_mensaje text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acepta_privacidad boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'web';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS landing_slug text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS page_url text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultimo_contacto_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS seguimiento_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS captado_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS descartado_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS eliminado_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_leads_estado_created ON leads(estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON leads(whatsapp);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_instagram ON leads(instagram);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
