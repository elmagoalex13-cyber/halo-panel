-- CONTRATOS para modelos nuevas (tabla contratos_modelos; ya existia otra tabla 'contratos' sin relacion con esto) (sin crearles el portal antes): se envian por email con un enlace donde la modelo lee una explicacion
-- sencilla, ve el contrato con su nombre y la fecha, y lo firma. Solo las toca el servidor (service role).
CREATE TABLE IF NOT EXISTS contratos_modelos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token            text NOT NULL UNIQUE,                 -- el enlace que recibe la modelo (/contrato/<token>)
  nombre           text NOT NULL,                        -- nombre de la modelo tal como va en el contrato
  email            text NOT NULL,
  fecha_inicio     date NOT NULL,
  firma_agencia    text,                                 -- firma de la agencia (PNG en data URL) en el momento del envio
  estado           text NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado', 'visto', 'firmado', 'cancelado')),
  enviado_por      text,
  enviado_at       timestamptz,                          -- cuando salio el email (NULL = no se envio, solo tiene enlace)
  email_error      text,
  visto_at         timestamptz,
  firmado_at       timestamptz,
  firma_creadora   text,                                 -- firma de la modelo (PNG en data URL)
  nombre_firmante  text,
  dni              text,
  firmante_ip      text,
  firmante_ua      text,
  pdf_key          text,                                 -- PDF firmado guardado en R2 (contratos/<id>.pdf)
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contratos_modelos_estado_idx ON contratos_modelos (estado, created_at DESC);
ALTER TABLE contratos_modelos ENABLE ROW LEVEL SECURITY;
