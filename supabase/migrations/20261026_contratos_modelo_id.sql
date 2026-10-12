-- Cada contrato firmado queda ligado a su modelo (se ve en su ficha y en el archivo de contratos). Si se borra la modelo, el contrato se conserva sin ligar.
ALTER TABLE contratos_modelos ADD COLUMN IF NOT EXISTS modelo_id uuid REFERENCES modelos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS contratos_modelos_modelo_idx ON contratos_modelos (modelo_id);
