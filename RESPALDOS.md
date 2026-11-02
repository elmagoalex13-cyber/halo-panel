# Respaldos y qué hacer si algo se cae

## Qué se guarda y dónde
Cada noche (a partir de las 03:00 UTC) el servidor copia **toda** la base de datos y la deja en dos sitios que **no dependen de Supabase**:

| Dónde | Ruta | Cuánto se conserva |
|---|---|---|
| Disco del servidor | `/opt/halo-backups/db/AAAA-MM-DD/` | 30 días |
| Cloudflare R2 | `backups/db/AAAA-MM-DD/` | 30 días (~2 MB al día) |

Cada día contiene un `.json.gz` por tabla y un `_esquema.sql` con la estructura (tablas, claves, funciones, vistas, triggers, RLS).
Para bajar una copia al PC: doble clic en `_copia_datos.cmd`.

## Avisos automáticos por Telegram (al chat privado del dueño)
- **Supabase restringido o caído:** aviso en como mucho 5 minutos (a los 15 si es un fallo distinto de «cupo superado») y aviso cuando vuelve.
- **Cloudflare R2:** se mide cada 12 h (`panel_config.r2_uso`). Aviso al llegar a 8 GB (el tramo gratuito acaba en 10 GB) y al superarlo, con el coste estimado. Las descargas de R2 no se cobran; solo el espacio (0,015 $/GB al mes sobre los 10 GB gratis).
- El servidor cancela solo las subidas por partes que quedaron a medias hace más de 36 h (ocupan espacio y no sirven).

## Si Supabase se bloquea otra vez (error 402 / «exceed_egress_quota»)
1. Mira la fecha de reinicio en Supabase → Organization → Billing → Usage. Los datos no se pierden.
2. Para seguir trabajando sin pagar, monta un proyecto nuevo en una **organización nueva** (cada organización tiene su propio cupo):
   1. Crea organización (plan Free) y proyecto en Supabase.
   2. En el SQL Editor del proyecto nuevo, pega y ejecuta `_esquema.sql` de la copia más reciente.
   3. Restaura los datos: `cd runner && SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node restaurar.mjs <carpeta-del-día | AAAA-MM-DD>` (con una fecha lee de R2).
   4. Crea los buckets de Storage: `fotos-modelos`, `portal-uploads` (privados).
   5. Cambia `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel (y vuelve a desplegar) y en el servidor (`_cambiar_supabase.cmd`).
3. Si el proyecto antiguo sigue legible desde su panel web (SQL Editor), se puede sacar de ahí lo más reciente (así se hizo el 2 de noviembre de 2026 sin perder nada).

## Para no volver a pasarse del cupo de Supabase (5 GB/mes de transferencia en Free)
- El servidor consulta con poca frecuencia (copias cada 10 min, vistas previas cada 5 min…); no vuelvas a poner ciclos de segundos con consultas grandes.
- El panel se refresca solo cada 5 minutos como mucho.
- Revisa Organization → Billing → Usage de vez en cuando; Supabase también avisa por correo al acercarse al límite (comprueba que ese correo lo lees).
