-- Vault con dos ambitos: "privado" (solo el dueño) y "compartido" (el dueño y los usuarios del panel que tengan acceso al Vault).
-- Todo lo que ya existe pasa a PRIVADO: nada se comparte sin que lo decidas.

ALTER TABLE vault_panel
  ADD COLUMN IF NOT EXISTS ambito text NOT NULL DEFAULT 'privado';

ALTER TABLE vault_panel DROP CONSTRAINT IF EXISTS vault_panel_ambito_check;
ALTER TABLE vault_panel
  ADD CONSTRAINT vault_panel_ambito_check CHECK (ambito IN ('privado', 'compartido'));

CREATE INDEX IF NOT EXISTS vault_panel_ambito_idx ON vault_panel (ambito);
