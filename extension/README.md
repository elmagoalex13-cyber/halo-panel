# HALO Virales (extensión de Chrome)

Abre las cuentas de Instagram desde **tu Chrome** (con tu sesión y tu IP), saca los reels más virales
de los últimos días y los manda al panel. Sustituye al scraper del VPS, que Instagram bloquea.

## Instalar (una vez)

1. En Chrome abre `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige la carpeta `extension` de este proyecto.
4. (Opcional) Ancla la extensión con el icono del puzzle.

Requisitos en ese mismo Chrome: sesión iniciada en **instagram.com** y en el **panel**.

## Usar

- **Desde el panel:** Instagram → *Cuentas de referencia* o *Ideas virales* (botón «Buscar virales con la
  extensión», con filtro por tipo de cuenta) o *Virales propios* (cuentas de tus modelos).
- **Desde el icono de la extensión:** elige qué analizar, tipo de cuenta y días, y pulsa *Analizar*.

Qué hace con cada cuenta: lee sus últimos reels, descarta los de más de N días (14 por defecto) y se
queda con los que superan 1,5× la mediana de la cuenta (máx. 8 por cuenta, los mejores primero). Sube
solo esos a R2 y los registra en el panel. Los que ya existen (aprobados o descartados también) no se
repiten.

- Cuentas de referencia → pestaña **Ideas virales** (aprobar y asignar a modelos).
- Cuentas de modelos → pestaña **Virales propios** (aprobar, descargar, marcar como subido a trial).

## Notas

- No guarda contraseñas: usa las sesiones que ya tienes abiertas.
- Pausa 2,5–5 s entre cuentas para no cansar a Instagram. Si pide ir más despacio (429), se detiene.
- Si cambias el dominio del panel, ajusta la URL en el popup (y en `manifest.json` → `host_permissions`
  y `content_scripts.matches`).
- Tras editar archivos de la extensión: `chrome://extensions` → recargar.
