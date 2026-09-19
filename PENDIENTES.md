# HALO Panel — pendientes para dejarlo 100 % en marcha

Última revisión: 2026-09-19. Marca cada punto cuando lo hagas.

## A. Bloqueantes (sin esto no funciona en producción)

- [x] **CORS de R2** (Cloudflare → R2 → bucket `halo-videos` → Settings → CORS policy). Probado el preflight `PUT` desde `https://halo-panel.vercel.app`: R2 devuelve `204` y permite `GET, HEAD, PUT`.
  ```json
  [
    {
      "AllowedOrigins": ["https://halo-panel.vercel.app", "https://halo-panel-elmagoalex13-gmailcoms-projects.vercel.app"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```
- [x] **Crear el acceso de cada modelo**: creada la activa actual `modelo_test` con enlace `/m/modelo-test`. El login en producción devuelve `ok`.
- [x] **Variables en Vercel**: comprobadas `VAULT_MASTER_KEY`, `R2_*`, `NEXT_PUBLIC_R2_PUBLIC_URL`, `SUPABASE_SERVICE_ROLE_KEY`, y añadido `CRON_SECRET` en Production y Preview.
- [x] **Desplegar el runner en el VPS** (94.143.143.73): desplegada versión 2.0.0 en `/opt/halo-runner`, `pm2` online, `POLL_INTERVAL_MS=15000`, `MAX_PIEZAS=3`, ffmpeg/ffprobe OK y Whisper instalado con modelo `small`.
- [ ] **`.env` del VPS**: `PANEL_URL` y `CRON_SECRET` ya están configurados. Falta `IG_SESSIONID` (cookie `sessionid` de una cuenta de Instagram dedicada) para evitar 429 en scraper/trial reels.

## B. Publer (programación automática)

- [ ] Contratar/activar Publer y añadir en Vercel: `PUBLER_API_KEY`, `PUBLER_WORKSPACE_ID`. `CRON_SECRET` ya está creado. Ajustes → «Publer» debe salir «Conectado» y listar las cuentas.
- [ ] El nombre de cada cuenta en Publer = usuario de Instagram registrado en el panel (Modelos → cuentas de Instagram).
- [ ] Probar con un vídeo real de punta a punta (subida → edición → aprobar → aparece programado en Publer). Nunca se ha probado contra Publer real, solo contra una simulación: si falla, el motivo sale en la Mesa al aprobar.
- Mientras Publer no esté activo: los aprobados quedan en Aprobación → Aprobados, se descargan y se suben a mano; se programarán solos al activar Publer.

## C. Sin probar contra el servicio real

- [ ] Scraper de cuentas de referencia y descarga de reels por URL (necesitan `IG_SESSIONID`; Instagram devolvió 429 desde mi red sin sesión).
- [ ] Generación de trial reels con datos reales de Instagram (el spoofer y el límite de 5 usos sí están probados con ffmpeg y R2 reales).
- [ ] Plan de Vercel: la programación en Publer puede tardar; si el plan limita a < 60 s por llamada, se programa en varias pasadas (cada 10 min por el runner).

## D. Limpieza

- [x] Borrar el código muerto de las secciones eliminadas. Se eliminaron las rutas antiguas; se mantuvo `/api/upload` porque Aprobación todavía lo usa para «Cambiar video».
  ```bash
  git rm -r src/app/biblioteca src/app/reparto src/app/calendario src/app/metricas src/app/api/biblioteca src/app/api/reparto src/app/api/calendario src/app/api/pubbler src/app/api/admin src/app/api/telegram src/app/api/drive
  ```
- [x] SQL en Supabase: `confirmado_at` ya existe en `referencias_videos`.
- [ ] `blueprint-sistema.md` no estaba en el repo: si el blueprint pide algo más, decirlo.

## E. Decisiones tomadas (por si quieres cambiarlas)

- Horarios (hora de España, por cuenta): reels 09:00 y 18:30; trial reels 09:00, 14:00 y 19:00 → `HORAS_REEL` / `HORAS_TRIAL` en `src/lib/publer.ts`.
- Trial reels: virales propios (vistas > mediana × 1,5), máximo 5 usos por vídeo, 9 en cola por cuenta → variables `TRIAL_*` del runner.
- El tipo 4 (con referencia) se guarda como `tipo=4` y `tipo_video` nulo (la BD solo admite tipo1–3).
- Los trial reels son filas de `library_content` con `tipo=5`, `origen='sistema'`.
- Comentarios y compartidos de los vídeos virales se guardan en `referencias_videos.tags` como `m:clave=valor` (no hay columnas).
- Instagram no publica los «compartidos»: salen como «n/d».
- Rutas de Telegram: siguen en el código, dormidas (sin token). Se van con el borrado de la sección D.
