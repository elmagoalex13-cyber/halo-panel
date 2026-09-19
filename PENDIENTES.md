# HALO Panel — pendientes para dejarlo 100 % en marcha

Última revisión: 2026-09-19. Marca cada punto cuando lo hagas.

## A. Bloqueantes (sin esto no funciona en producción)

- [ ] **CORS de R2** (Cloudflare → R2 → bucket `halo-videos` → Settings → CORS policy). Sin esto **las modelos no pueden subir vídeos desde su portal** (el navegador sube directo a R2 y hoy R2 responde 403 al preflight). Intenté configurarlo con las claves R2 del proyecto y Cloudflare respondió `AccessDenied`, así que hay que hacerlo desde Cloudflare o con una API key con permiso de administrar bucket. Pega:
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
- [ ] **Desplegar el runner en el VPS** (94.143.143.73): comandos en `runner/README.md`. Sin esto no se editan vídeos, no hay scraper, no hay trial reels ni descarga de referencias por URL. Intenté entrar por SSH y el servidor respondió `Permission denied (publickey,password)`, así que hace falta contraseña o clave SSH. Causa de que el vídeo de prueba no se procesara: `POLL_INTERVAL_MS=600000` (10 min); el despliegue lo deja en 15000.
- [ ] **`.env` del VPS**: `IG_SESSIONID` (cookie `sessionid` de una cuenta de Instagram dedicada), `PANEL_URL`, `CRON_SECRET` (el mismo valor que en Vercel).

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
