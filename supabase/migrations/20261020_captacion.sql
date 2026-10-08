-- CAPTACION DE MODELOS + AVISOS POR TELEGRAM + BORRADO DE ARCHIVOS DE PIEZAS
--
-- 1) Captacion: una modelo con "objetivo_videos" (p. ej. 30) sube sus videos pero NO se editan hasta que la agencia aprueba el lote.
--    El aviso "crea su cuenta de Instagram" sale cuando llega al objetivo. Las modelos que se crean como compartidas nacen con 30.
-- 2) telegram_cola: cola de avisos que el editor (runner) envia al grupo de Telegram (agrupados para no saturar).
-- 3) archivos_borrados_at: pieza cuyos archivos (video editado, original, preview) se borraron a mano para liberar espacio; la fila se
--    conserva para las estadisticas pero ya no aparece en la Mesa.
-- Solo las toca el servidor (service role).

ALTER TABLE modelos ADD COLUMN IF NOT EXISTS objetivo_videos        integer;       -- NULL = sin fase de captacion
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS captacion_aprobada_at  timestamptz;   -- cuando la agencia aprobo el lote (despues se edita todo al subir)
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS umbral_avisado_at      timestamptz;   -- ya se aviso de "llego al objetivo"

ALTER TABLE library_content ADD COLUMN IF NOT EXISTS archivos_borrados_at timestamptz;

CREATE TABLE IF NOT EXISTS telegram_cola (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL,              -- subida | umbral | accesos | prueba | lote
  modelo_id   uuid,
  datos       jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  enviado_at  timestamptz
);
CREATE INDEX IF NOT EXISTS telegram_cola_pendientes_idx ON telegram_cola (created_at) WHERE enviado_at IS NULL;
ALTER TABLE telegram_cola ENABLE ROW LEVEL SECURITY;

-- La funcion del dashboard: las piezas cuyos archivos se borraron a mano no cuentan como 'aprobadas' pendientes de publicar
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
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'publicado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'rechazado'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL AND lc.publicado_at > p_ahora),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL AND lc.publicado_at <= p_ahora),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando' AND lc.estado_procesamiento = 'pendiente'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'editando' AND lc.estado_procesamiento = 'procesando'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado_procesamiento = 'error'),
    max(lc.recibido_at) FILTER (WHERE lc.tipo IS DISTINCT FROM 5),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.recibido_at >= p_mes_pasado_inicio AND lc.recibido_at < p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado IN ('aprobado','publicado') AND lc.aprobado_at >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL  AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_ahora - interval '7 days'),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL  AND COALESCE(lc.aprobado_at, lc.recibido_at) >= p_mes_inicio),
    count(*) FILTER (WHERE lc.tipo IS DISTINCT FROM 5 AND lc.estado = 'aprobado' AND lc.archivos_borrados_at IS NULL),
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
