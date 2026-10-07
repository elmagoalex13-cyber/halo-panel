-- Usuarios adicionales del panel (socios, ayudantes...), cada uno con las secciones que NO puede ver.
-- El usuario "dueño" sigue siendo el de las variables de entorno (ADMIN_USERNAME / ADMIN_PASSWORD) y lo ve todo.
-- Las contraseñas se guardan con scrypt + sal (nunca en claro). Solo las toca el servidor (service role).

CREATE TABLE IF NOT EXISTS panel_usuarios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username          text NOT NULL UNIQUE,              -- en minusculas
  nombre            text,
  salt              text NOT NULL,
  hash              text NOT NULL,
  activo            boolean NOT NULL DEFAULT true,
  areas_denegadas   text[] NOT NULL DEFAULT ARRAY['leads'],  -- secciones que no puede ver (ver src/lib/areas.ts)
  ultimo_acceso_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE panel_usuarios ENABLE ROW LEVEL SECURITY;
