# HALO Runner — Editor de vídeo en Ionos

Runner Node.js que procesa piezas de vídeo con ffmpeg + Whisper.
Se despliega en el servidor Ionos mediante PM2.

## Requisitos en el servidor

- Node.js ≥ 20
- PM2 (`npm install -g pm2`)
- ffmpeg + ffprobe instalados y en PATH
- whisper.cpp compilado (`whisper-cpp` o la ruta que definas en `.env`)
- Modelo Whisper: `ggml-small.bin` en `/opt/whisper/`

## Instalación

```bash
# 1. Copiar la carpeta runner al servidor
scp -r runner/ usuario@ionos-server:/opt/halo-runner

# 2. En el servidor
cd /opt/halo-runner
cp .env.example .env
nano .env  # Rellenar todos los valores

# 3. Instalar dependencias
npm install

# 4. Aplicar migración SQL en Supabase
# (pegar el contenido de migrations/001_runner_fields.sql en el SQL Editor)

# 5. Crear directorio de logs
mkdir -p /var/log/halo-runner

# 6. Iniciar con PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Seguir las instrucciones para auto-arranque
```

## Comandos útiles

```bash
pm2 status               # Ver estado del proceso
pm2 logs halo-runner     # Ver logs en tiempo real
pm2 restart halo-runner  # Reiniciar
pm2 stop halo-runner     # Parar
```

## Flujo de procesado

```
Supabase (estado='editando')
  → Descarga bruto de R2
  → [Tipo 1/3] Whisper: extrae audio WAV → transcribe → genera .ass
  → [Tipo 2]   ffmpeg: reencuadra + quema frase + audio referencia
  → [Tipo 4]   ffmpeg: replica estructura del vídeo referencia
  → Sube editado a R2 (carpeta editado/)
  → Actualiza estado → 'en_aprobacion'
  → Telegram: notificación al admin

Supabase (trial_reels.estado='pendiente_spoofer')
  → Descarga original de R2
  → ffmpeg: recorte + zoom + eq (brillo/contraste/saturación)
  → Elimina metadatos
  → Sube a R2 (carpeta trial/)
  → Actualiza estado → 'pendiente_aprobacion'
  → Telegram: notificación al admin
```

## Tipos de vídeo

| Tipo | Descripción | Herramientas |
|------|-------------|--------------|
| tipo1 | Hablando a cámara | Whisper (subtítulos) + ffmpeg |
| tipo2 | Caption/Frase | ffmpeg (drawtext) + audio referencia opcional |
| tipo3 | Reto | Whisper (subtítulos) + ffmpeg (freeze frame final) |
| tipo4 | Con vídeo referencia | ffmpeg (replica duración y estructura) |
