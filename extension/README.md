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

## Reparto entre varias personas y ronda del lunes (v1.6)

- **Si tu socio y tú analizáis las cuentas de referencia a la vez**, no hay cola: el panel reparte las cuentas, cada una la coge
  una sola persona y la otra pasa a la siguiente. Se acaba en la mitad de tiempo y no se analiza nada dos veces. La lista de
  cuentas muestra «con <usuario>…» en las que está haciendo el otro.
- **Cada lunes a las 8:00 (Madrid)** la extensión lanza sola una ronda de TODAS las cuentas de referencia con los últimos 7 días.
  Hace falta un Chrome abierto con la extensión, Instagram y el panel con la sesión iniciada (basta con uno de los dos). Si el
  lunes no había ninguno abierto, la hace el primero que se abra después. En el dashboard sale si está hecha o si falta.
- Las cuentas de tus modelos y las cuentas elegidas a mano no se reparten: se analizan tal cual.

## Notas

- No guarda contraseñas: usa las sesiones que ya tienes abiertas.
- Pausa 2,5–5 s entre cuentas para no cansar a Instagram. Si pide ir más despacio (429), se detiene.
- Si cambias el dominio del panel, ajusta la URL en el popup (y en `manifest.json` → `host_permissions`
  y `content_scripts.matches`).
- Tras editar archivos de la extensión: `chrome://extensions` → recargar.
