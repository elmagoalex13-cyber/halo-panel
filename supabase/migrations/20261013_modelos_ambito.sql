-- Modelos "mias" (solo el dueño) y modelos "compartidas" (el dueño y los usuarios del panel con acceso).
-- Un usuario que no es el dueño solo ve las modelos COMPARTIDAS y todo lo que cuelga de ellas (videos, OnlyFans, cuentas,
-- facturacion...). Todas las modelos actuales pasan a ser SOLO TUYAS: nada se comparte sin que tu lo decidas.

ALTER TABLE modelos
  ADD COLUMN IF NOT EXISTS ambito text NOT NULL DEFAULT 'privado';

ALTER TABLE modelos DROP CONSTRAINT IF EXISTS modelos_ambito_check;
ALTER TABLE modelos
  ADD CONSTRAINT modelos_ambito_check CHECK (ambito IN ('privado', 'compartido'));

CREATE INDEX IF NOT EXISTS modelos_ambito_idx ON modelos (ambito);
