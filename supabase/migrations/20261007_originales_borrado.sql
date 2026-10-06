-- Originales de las modelos: poder borrar a mano el archivo original (para que no se acumulen meses y meses)
-- sin perder el historico de la pieza. Al borrar un original se guarda aqui la fecha; la fila de la pieza
-- (estado, video editado, publicacion...) se conserva.

ALTER TABLE library_content ADD COLUMN IF NOT EXISTS original_borrado_at timestamptz;
