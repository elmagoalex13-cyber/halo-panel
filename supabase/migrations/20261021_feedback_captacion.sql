-- FEEDBACK de la agencia sobre los reels de una modelo en captacion ("va bien" / "mejorar" + comentario).
-- Lo escribe la agencia en la pestaña Captacion de la ficha de la modelo y lo ve la modelo en su portal (pestaña Subidos).
ALTER TABLE library_content ADD COLUMN IF NOT EXISTS feedback_tipo  text;         -- 'bien' | 'mejorar'
ALTER TABLE library_content ADD COLUMN IF NOT EXISTS feedback_texto text;
ALTER TABLE library_content ADD COLUMN IF NOT EXISTS feedback_at    timestamptz;
