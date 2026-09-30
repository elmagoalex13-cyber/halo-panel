-- Recorte manual (en segundos, relativos al video bruto original) para videos
-- hablados (tipo1/tipo3/tipo4). Permite al admin marcar desde la mesa de
-- aprobacion donde empieza/termina de hablar cuando la deteccion automatica
-- no acierta, en vez de depender solo de Whisper + deteccion de voz.
ALTER TABLE library_content ADD COLUMN IF NOT EXISTS recorte_inicio numeric;
ALTER TABLE library_content ADD COLUMN IF NOT EXISTS recorte_fin numeric;
