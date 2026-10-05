-- Facturacion desde Venuz.ai (scraper del runner -> panel).
--
-- venuz_cuentas            una fila por creadora de Venuz, con su vinculo a una modelo del panel.
-- venuz_ingresos_diarios   ingresos por dia y canal (neto y bruto): de aqui salen los totales y el
--                          "de que parte viene el dinero" para cualquier periodo.
-- venuz_resumen_mensual    foto mensual que da Venuz (fans activos, nuevos, renovaciones, reembolsos...).
-- facturacion_modelos      ya existia y no se toca: sigue siendo el registro manual de cobros/comisiones.
--
-- Solo las toca el servidor (service role); RLS activado sin politicas para que la clave anon
-- publica no pueda leerlas.

CREATE TABLE IF NOT EXISTS venuz_cuentas (
  id               text PRIMARY KEY,          -- id de la cuenta en Venuz (uuid)
  nombre           text NOT NULL,
  username         text,
  avatar_url       text,
  modelo_id        uuid,                      -- modelo del panel a la que corresponde (null = sin vincular)
  vinculo_manual   boolean NOT NULL DEFAULT false, -- true si la vinculaste tu: el scraper no la cambia
  activa           boolean NOT NULL DEFAULT true,
  estado_conexion  text,
  suscriptores     integer,
  ultima_sync_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venuz_ingresos_diarios (
  cuenta_id        text NOT NULL,
  fecha            date NOT NULL,
  suscripciones    numeric(12,2) NOT NULL DEFAULT 0,
  mensajes         numeric(12,2) NOT NULL DEFAULT 0,
  tips             numeric(12,2) NOT NULL DEFAULT 0,
  posts            numeric(12,2) NOT NULL DEFAULT 0,
  referidos        numeric(12,2) NOT NULL DEFAULT 0,
  streams          numeric(12,2) NOT NULL DEFAULT 0,
  total            numeric(12,2) NOT NULL DEFAULT 0,   -- neto (lo que de verdad se cobra)
  suscripciones_bruto numeric(12,2) NOT NULL DEFAULT 0,
  mensajes_bruto   numeric(12,2) NOT NULL DEFAULT 0,
  tips_bruto       numeric(12,2) NOT NULL DEFAULT 0,
  posts_bruto      numeric(12,2) NOT NULL DEFAULT 0,
  referidos_bruto  numeric(12,2) NOT NULL DEFAULT 0,
  streams_bruto    numeric(12,2) NOT NULL DEFAULT 0,
  total_bruto      numeric(12,2) NOT NULL DEFAULT 0,
  actualizado_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_id, fecha)
);
CREATE INDEX IF NOT EXISTS venuz_ingresos_diarios_fecha_idx ON venuz_ingresos_diarios (fecha);

CREATE TABLE IF NOT EXISTS venuz_resumen_mensual (
  cuenta_id        text NOT NULL,
  mes              date NOT NULL,             -- primer dia del mes (UTC)
  total_neto       numeric(12,2) NOT NULL DEFAULT 0,
  total_bruto      numeric(12,2) NOT NULL DEFAULT 0,
  suscripciones    numeric(12,2) NOT NULL DEFAULT 0,
  tips             numeric(12,2) NOT NULL DEFAULT 0,
  ppv              numeric(12,2) NOT NULL DEFAULT 0,
  posts            numeric(12,2) NOT NULL DEFAULT 0,
  reembolsos       numeric(12,2) NOT NULL DEFAULT 0,
  fans_activos     integer,
  fans_nuevos      integer,
  renovaciones     integer,
  ventas           integer,
  gasto_medio_fan  numeric(12,2),
  actualizado_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_id, mes)
);

ALTER TABLE venuz_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venuz_ingresos_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE venuz_resumen_mensual ENABLE ROW LEVEL SECURITY;
