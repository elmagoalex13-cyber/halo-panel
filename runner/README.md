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
`APIFY_TOKEN` (activa el scraper de referencias), `SCRAPER_HORAS` (24), `SCRAPER_MAX_REELS` (30),
`SCRAPER_FACTOR` (1.5), `SCRAPER_ACTOR` (`apify~instagram-reel-scraper`).

## Tipos
1 hablando (subtítulos) · 2 caption (frase del banco quemada; si la pieza no trae `frase_quemada`,
el runner coge la menos usada de `banco_frases_canciones`) · 3 reto (subtítulos + freeze) ·
4 con referencia (recorta a la duración de `r2_key_referencia`).

## Scraper de referencias virales (Apify)
Con `APIFY_TOKEN` en el `.env`, el mismo proceso del runner analiza las cuentas activas de
**Instagram → Referencias** (`referencias_cuentas`, espejadas en `cuentas_referencia`):

1. pide los últimos reels de cada cuenta a Apify,
2. calcula la **mediana de vistas** y el umbral viral (**mediana × 1,5**),
3. los reels que superan el umbral se descargan a R2 (`referencias/<cuenta>/<código>.mp4`) y se guardan en
   `referencias_videos` (`estado_triaje='pendiente'`), sin duplicados,
4. actualiza `mediana_vistas`, `umbral_viral`, `total_procesados`, `total_extraidos` en `cuentas_referencia`.

En el panel (**Instagram → Ideas virales**) revisas cada viral y pulsas **Aprobar y enviar**: eliges tipo (1-4) y modelo →
se crea la `referencia` en el banco y un `encargo` que la modelo ve en su portal (“Tus vídeos pendientes”).

Cada cuenta se analiza cada 24 h; “Scrapear todas” en el panel (o poner `ultimo_scrape_at = null`) la pone en cola
y el runner la coge en menos de 1 minuto. Para lanzarlo ya desde el VPS:

```bash
ssh root@94.143.143.73 'cd /opt/halo-runner && grep -q "^APIFY_TOKEN=" .env || echo "APIFY_TOKEN=apify_api_XXXX" >> .env; pm2 restart halo-runner --update-env && node src/scraper-cli.mjs'
```
(sustituye `apify_api_XXXX` por tu token de https://console.apify.com/account/integrations)
