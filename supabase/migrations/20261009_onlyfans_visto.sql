-- Aviso de contenido nuevo de OnlyFans: se guarda cuando abres un script/pack/post en el panel.
-- Hay contenido "nuevo" si la modelo subio archivos despues de la ultima vez que lo abriste.

ALTER TABLE of_colecciones ADD COLUMN IF NOT EXISTS visto_at timestamptz;
