# Conectar una web al panel de leads

Cada web envía su formulario a:

```
POST https://halo-panel.vercel.app/api/leads/public
Content-Type: application/json
```

Campos obligatorios: `nombre`, `email`, `whatsapp`, `instagram`, `pais`.
Opcionales: `experiencia`, `ingresos`, `necesidades` (lista), `otro_mensaje`, `acepta_privacidad` (true/false), `landing_slug`, `page_url`, `referrer`, `adjuntos`.

El panel saca de qué web viene el lead de `origen` (si se manda) o, si no, del dominio de `page_url` (o de la cabecera Origin del navegador).
Todo lo que venga de un dominio que acabe en **.es** (p. ej. `halomodelsagency.es`) sale en Leads con la etiqueta **ESPAÑA**, su borde amarillo y el filtro «Mercado → España».

## Ejemplo (navegador)

```js
await fetch("https://halo-panel.vercel.app/api/leads/public", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nombre, email, whatsapp, instagram, pais,
    experiencia, ingresos, necesidades: [], otro_mensaje: "",
    acepta_privacidad: true,
    origen: "halomodelsagency.es",
    page_url: window.location.href,
    referrer: document.referrer,
  }),
});
```

Si se configura `LEADS_INGEST_KEY` en Vercel, hay que mandar también la cabecera `X-Halo-Leads-Key` con ese valor (hoy no está puesta).
