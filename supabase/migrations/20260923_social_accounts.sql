-- Permite guardar varias redes sociales por modelo.
-- Las cuentas existentes se consideran Instagram para mantener compatibilidad.

ALTER TABLE cuentas_instagram
  ADD COLUMN IF NOT EXISTS red_social text NOT NULL DEFAULT 'instagram';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cuentas_instagram_red_social_check'
  ) THEN
    ALTER TABLE cuentas_instagram
      ADD CONSTRAINT cuentas_instagram_red_social_check
      CHECK (red_social IN ('instagram', 'twitter', 'tiktok'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cuentas_instagram_red_social
  ON cuentas_instagram(red_social);
