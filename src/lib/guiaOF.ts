// GUIA DE SCRIPTS que ven las modelos en su portal. El texto es el de "Guia_scripts_general" TAL CUAL, sin cambiar nada
// (duraciones, cantidades de fotos y vídeos, frases e incluso las faltas de la guía original). Seguro para cliente y servidor.

export type FaseGuia = { titulo: string; resumen: string; puntos: string[] };

export const GUIA_SCRIPT = {
  titulo: "Creación de scripts",
  queEs: {
    titulo: "¿Qué es un contenido de Sexting (Script)?",
    parrafos: [
      "Es un contenido que se vende como si lo estuvieras grabando en ese mismo momento para el suscriptor: que sienta que interactúas uno a uno con él, como si grabaras desde tu teléfono y se lo enviaras al instante.",
      "Sin cortes, ediciones, filtros ni música añadida; progresión natural y continua; ambiente privado y silencioso. Incluye fotos de progresión y, al final, fotos del después. Graba con luz artificial.",
    ],
  },
  dondeGrabar: {
    titulo: "Donde puedes grabar",
    parrafos: [
      "Baño, cocina, salón, dormitorio, pasillo, terraza (sin vistas a un lugar público), estudiando, con el ordenador, leyendo, arreglandome para salir o volver de fiesta, pintando/cosiendo... cualquier actividad que le guste a la modelo.",
    ],
  },
  estructura: {
    titulo: "Estructura para crear scripts",
    intro: "El sexting se plantea en 8 fases progresivas, para generar intriga, mantener la atención del fan y subir el valor del contenido de forma escalonada.",
    fases: [
      {
        titulo: "Fase 1 - TEASER",
        resumen: "1 foto + 1 video",
        puntos: ["FOTO 1: lencería muy coqueta (foto tipo selfie sencilla).", "1 video breve (5-10 seg) enseñando cómo estás"],
      },
      {
        titulo: "Fase 2 - CALENTAMIENTO (TEASING SENSUAL)",
        resumen: "1 video (~2 min) + 2 fotos",
        puntos: [
          "1 vídeo con movimientos sensuales provocando a querer ver más (dejando ver un poco de nada como por ejemplo medio pezón etc..) donde estés (cama, baño...), sin nada explicito.",
          "2 fotos provocativas (insinuantes).",
        ],
      },
      {
        titulo: "Fase 3 - DESNUDO SUPERIOR",
        resumen: "1 video (2 min minimo) + 4 fotos",
        puntos: ["1 video donde muestra los senos y juega con ellos; mirada picara, morderte los labios...", "4 fotos relacionadas."],
      },
      {
        titulo: "Fase 4 - DESNUDO COMPLETO",
        resumen: "1 video (2-2,5 min) + 4 fotos",
        puntos: ["1 vídeo: quítate la parte de abajo; muéstrate entera. Vagina sin tocarte.", "4 fotos relacionadas."],
      },
      {
        titulo: "Fase 5 - MASTURBACION SUPERFICIAL",
        resumen: "1 video (2,5-3 min) + 4 fotos",
        puntos: ["Tócate senos y clítoris suave; gemidos suaves.", "4 fotos relacionadas."],
      },
      {
        titulo: "Fase 6 - MASTURBACION INTENSA",
        resumen: "1 video (3-3,5 min) + 4 fotos",
        puntos: ["1 vídeo: Masturbación fuerte con dedos o dildo, sin orgasmo. Gime con pausas.", "4 fotos relacionadas."],
      },
      {
        titulo: "Fase 7 - ORGASMO",
        resumen: "1 video (4-5 min) + 4 fotos",
        puntos: ["1 vídeo: Hasta el orgasmo. Gime fuerte o finge correrte.", "4 fotos relacionadas."],
      },
      {
        titulo: "Fase 8 - AFTERCARE (CIERRE)",
        resumen: "1 video corto (10-15 seg)",
        puntos: ["1 vídeo: Sonríe, relájate, di que te encanto. NO digas gracias por esta noche/mañana.", "2 fotos relajadas + 2 fotos explícitas (cuerpo completo)."],
      },
    ] as FaseGuia[],
  },
  indicaciones: {
    titulo: "Indicaciones generales",
    puntos: [
      "Luz artificial (reutilizable a cualquier hora).",
      "Se expresiva; deja que el sub te escuche. Muestra play/pause al inicio y al final de cada video.",
      "Sin música en edición (si acaso, de fondo, suave). Sin cortes, ediciones ni zooms.",
      "Si no te convence, graba el video completo (no edites ni recortes). Sin filtros ni Tik Tok.",
      "Las fotos se toman aparte (no capturas de video). Grabate tú misma (trípode/mueble).",
      "Nada de TVs encendidas ni personas de fondo. Solo espacios privados y cerrados.",
      "Todos los scripts incluyen masturbación (suave -> intensa -> orgasmo).",
      "Evita saludos (Hola, ¿cómo estás?). Varía ropa y locaciones. Tono sensual y realista.",
      "Graba en 1080p, 30 fps.",
    ],
  },
  ejemplos: "Ejemplos de posturas, ubicaciones y ángulos",
} as const;

/** Claves de panel_config con los textos editables de las guías de packs y posts. */
export const CLAVE_GUIA = { pack: "guia_pack", post: "guia_post" } as const;
export type CategoriaReferencia = "post" | "pack" | "script_ejemplo";
export const ETIQUETA_REFERENCIA: Record<CategoriaReferencia, string> = {
  post: "Posts de OnlyFans",
  pack: "Packs de fotos",
  script_ejemplo: "Ejemplos de scripts (posturas, ubicaciones y ángulos)",
};
