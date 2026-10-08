-- ESCALA (20 modelos, ~1.200-2.400 reels al mes):
--  1) panel_config: ajustes del panel (dias de retencion de originales...) y latido del editor (runner). Una fila por clave.
--  2) dashboard_piezas(): agregados por modelo calculados en la base de datos. Antes el dashboard bajaba hasta 1.000 videos
--     (el tope de Supabase) y a partir de ahi sus numeros salian mal; asi vale para cualquier volumen y es instantaneo.
-- Solo las toca el servidor (service role); el navegador no puede leer ni ejecutar nada de esto.

CREATE TABLE IF NOT EXISTS panel_config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE panel_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION dashboard_piezas(
  p_incluir            uuid[]      DEFAULT NULL,   -- solo estas modelos (NULL = todas)
  p_excluir            uuid[]      DEFAULT '{}',   -- sin estas (modelos en la papelera)
  p_ahora              timestamptz DEFAULT now(),
  p_mes_inicio         timestamptz DEFAULT date_trunc('month', now()),
  p_mes_pasado_inicio  timestamptz DEFAULT date_trunc('month', now()) - interval '1 month'
) RETURNS TABLE (
  modelo_id uuid, total bigint, editando bigint, en_aprobacion bigint, aprobado bigint, publicado bigint, rechazado bigint,
  aprobado_futuro bigint, aprobado_pasado bigint, r_pend bigint, r_proc bigint, r_err bigint,
  ult_recibido timestamptz, este_mes bigint, mes_pasado bigint, aprob_semana bigint,
  ap_semana bigint, ap_mes bigint, ap_todo bigint, co_semana bigint, co_mes bigint, co_todo bigint,
  urg_aprob bigint, urg_edit bigint, p30_total bigint, p30_aprobados bigint, p30_publicados bigint,
  trial_aprob_futuro bigint, trial_aprob_sin bigint, trial_publicados bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    lc.modelo_id,
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'en_aprobacion'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'rechazado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.publicado_at > p_ahora),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.publicado_at <= p_ahora),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando' AND lc.estado_procesamiento = 'pendiente'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando' AND lc.estado_procesamiento = 'procesando'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado_procesamiento = 'error'),
    max(lc.recibido_at) FILTER (WHERE lc.tipo IS DISTINCT FROM 5),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_mes_pasado_inicio AND lc.recibido_at < p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado IN ('aprobado','publicado') AND lc.aprobado_at >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado'  AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado'  AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado' AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado' AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'en_aprobacion' AND lc.recibido_at < p_ahora - interval '24 hours'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando'      AND lc.recibido_at < p_ahora - interval '24 hours'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_ahora - interval '30 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_ahora - interval '30 days' AND lc.estado IN ('aprobado','publicado')),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_ahora - interval '30 days' AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo = 5 AND lc.estado = 'aprobado' AND lc.publicado_at > p_ahora),
    count(*) FILTER (WHERE lc.tipo = 5 AND lc.estado = 'aprobado' AND NOT COALESCE(lc.publicado_at > p_ahora, false)),
    count(*) FILTER (WHERE lc.tipo = 5 AND lc.estado = 'publicado')
  FROM library_content lc
  WHERE (p_incluir IS NULL OR lc.modelo_id = ANY (p_incluir))
    AND (lc.modelo_id IS NULL OR NOT (lc.modelo_id = ANY (p_excluir)))
  GROUP BY lc.modelo_id
$$;

REVOKE ALL ON FUNCTION dashboard_piezas(uuid[], uuid[], timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dashboard_piezas(uuid[], uuid[], timestamptz, timestamptz, timestamptz) TO service_role;
