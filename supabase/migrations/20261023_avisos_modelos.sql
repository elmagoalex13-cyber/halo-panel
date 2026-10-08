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
