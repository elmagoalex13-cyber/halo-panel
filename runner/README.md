# HALO Runner (VPS 94.143.143.73)

Procesa los vídeos que llegan al panel. Sin Telegram.

**Cola:** `library_content` con `estado='editando'` y `estado_procesamiento='pendiente'`.
**Resultado:** sube a R2 `procesadas/<modelo_id>/<id>-tipoN.mp4` y deja la pieza en
`estado='en_aprobacion'`, `estado_procesamiento='listo'`, `video_procesado_url=...`.
Si falla: `estado_procesamiento='error'` + `error_mensaje` (en el panel, "Rehacer" la reintenta).

## Por qué "no procesaba" el vídeo de prueba
El `.env` del VPS tiene `POLL_INTERVAL_MS=600000` = **10 minutos** entre revisiones de la cola
(el vídeo `1f1195aa…` sí se procesó, tras esperar). Además el código antiguo del repo consultaba
columnas que no existen (`intentos_edicion`, `tiene_locucion`) y fallaba en silencio.

## 1) Diagnóstico (pegar en el VPS)

```bash
ssh root@94.143.143.73
pm2 status
pm2 logs halo-runner --lines 60 --nostream
grep -E "POLL_INTERVAL_MS|MAX_PIEZAS" /opt/halo-runner/.env
ffmpeg -version | head -1; ffprobe -version | head -1
which whisper-cpp whisper-cli main; ls /opt/whisper 2>/dev/null
```

## 2) Desplegar esta versión (desde tu PC, en la carpeta del proyecto)

```bash
scp -r runner/src runner/package.json root@94.143.143.73:/opt/halo-runner/
ssh root@94.143.143.73 'bash -s' <<'EOF'
set -e
cd /opt/halo-runner
cp -r /opt/halo-runner /opt/halo-runner.bak-$(date +%F-%H%M) 2>/dev/null || true
npm install --omit=dev
rm -f src/telegram.mjs src/spoofer.mjs
sed -i 's/^POLL_INTERVAL_MS=.*/POLL_INTERVAL_MS=15000/' .env
grep -q '^MAX_PIEZAS=' .env || echo 'MAX_PIEZAS=3' >> .env
pm2 restart halo-runner --update-env || pm2 start ecosystem.config.cjs
pm2 save
node src/diagnostico.mjs
pm2 logs halo-runner --lines 30 --nostream
EOF
```

Rollback: `rm -rf /opt/halo-runner && mv /opt/halo-runner.bak-<fecha> /opt/halo-runner && pm2 restart halo-runner`.

## 3) Instalar Whisper (solo si el diagnóstico dice "whisper no encontrado")
Sin Whisper los tipos 1/3/4 salen **sin subtítulos** (no fallan).

```bash
apt-get update && apt-get install -y build-essential cmake git ffmpeg
cd /opt && git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp
cmake -B build && cmake --build build -j --config Release
bash ./models/download-ggml-model.sh small
mkdir -p /opt/whisper && cp models/ggml-small.bin /opt/whisper/
ln -sf /opt/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cpp
node /opt/halo-runner/src/diagnostico.mjs
```

## Variables (`/opt/halo-runner/.env`)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (sin barra final y con un solo `https://`),
`POLL_INTERVAL_MS` (15000), `MAX_PIEZAS` (3). Opcionales: `WHISPER_BIN`, `WHISPER_MODEL`, `TMP_DIR`,
`IG_SESSIONID` (scraper y descarga de referencias), `SCRAPER_HORAS` (24), `SCRAPER_DIAS` (14),
`SCRAPER_MAX_REELS` (30), `SCRAPER_FACTOR` (1.5), `TRIAL_COLCHON` (9), `TRIAL_MAX_USOS` (5), `TRIAL_FACTOR` (1.5),
`TRIAL_HORAS` (3), `PANEL_URL` y `CRON_SECRET` (para que el runner avise al panel de que programe en Publer).

## Tipos
1 hablando (subtítulos) · 2 caption (frase del banco quemada; si la pieza no trae `frase_quemada`,
el runner coge la menos usada de `banco_frases_canciones`) · 3 reto (subtítulos + freeze) ·
4 con referencia (recorta a la duración de `r2_key_referencia`).

## Scraper propio de referencias virales (sin Apify)
El runner lee Instagram directamente (`src/instagram.mjs`) y analiza las cuentas activas de
**Instagram → Cuentas de referencia** (`referencias_cuentas`, espejadas en `cuentas_referencia`):

1. lee los últimos reels de cada cuenta,
2. calcula la **mediana de vistas** y el umbral viral (**mediana × 1,5**),
3. los reels de los últimos `SCRAPER_DIAS` (14) días que superan el umbral se descargan a R2
   (`referencias/<cuenta>/<código>.mp4`) y se guardan en `referencias_videos` con sus métricas
   (vistas, likes, comentarios, compartidos), sin duplicados,
4. actualiza `mediana_vistas`, `umbral_viral`, `total_procesados`, `total_extraidos`.

**Necesita la cookie `sessionid` de una cuenta de Instagram dedicada** (`IG_SESSIONID`): sin sesión Instagram
suele responder 429 a las IPs de servidor. Cómo sacarla: entra con esa cuenta en instagram.com desde Chrome →
F12 → Application → Cookies → `sessionid`.

También descarga a R2 los vídeos que asignas por URL desde **Asignar vídeos** (`src/referencias.mjs`):
enlaces de reels de Instagram (con la misma sesión) o URLs directas `.mp4`.

Cada cuenta se analiza cada `SCRAPER_HORAS` (24) h; «Scrapear todas» en el panel la pone en cola y el
runner la coge en menos de 1 minuto. Para lanzarlo ya desde el VPS:

```bash
ssh root@94.143.143.73 'cd /opt/halo-runner && grep -q "^IG_SESSIONID=" .env || echo "IG_SESSIONID=PEGA_AQUI_TU_SESSIONID" >> .env; pm2 restart halo-runner --update-env && node src/scraper-cli.mjs'
```

## Trial reels automáticos (spoofer)
Por cada cuenta de Instagram activa de una modelo, el runner (`src/trials.mjs`):

1. lee sus reels y se queda con los **virales** (vistas > mediana × `TRIAL_FACTOR`),
2. cada viral se puede reutilizar **como máximo 5 veces** (`TRIAL_MAX_USOS`). Cada uso pasa por el
   **spoofer** (`src/spoofer.mjs`): recorta ~1 s al inicio y ~1 s al final, amplía (zoom), ajusta brillo,
   contraste y saturación, aplica un filtro suave y borra metadatos, con parámetros distintos cada vez,
3. mantiene en cola `TRIAL_COLCHON` (9 = 3 días × 3 al día) trial reels por cuenta.

Cada trial es una fila de `library_content` (`origen='sistema'`, `tipo=5`, `estado='aprobado'`, `shortcode_ig` = reel de
origen) que el panel programa en Publer como **trial reel** a las 09:00, 14:00 y 19:00 (hora de España). Los reels
normales (los vídeos que apruebas) van a las 09:00 y 18:30.

El panel programa cuando se aprueba un vídeo, cuando alguien abre el panel y cuando el runner lo avisa cada 10 min:
en el `.env` del VPS añade `PANEL_URL=https://tu-panel.vercel.app` y `CRON_SECRET=<el mismo valor que en Vercel>`.
