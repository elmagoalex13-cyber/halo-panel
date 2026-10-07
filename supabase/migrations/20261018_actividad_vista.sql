-- Marca de "visto" en la actividad de tu socio: el numero rojo del menu lateral cuenta las acciones sensibles que aun no has abierto.
ALTER TABLE panel_actividad ADD COLUMN IF NOT EXISTS vista_at timestamptz;
CREATE INDEX IF NOT EXISTS panel_actividad_nuevas_idx ON panel_actividad (created_at DESC) WHERE sensible AND vista_at IS NULL;
