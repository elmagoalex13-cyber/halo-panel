// Esquema unico del onboarding de creadoras: lo usan el formulario del portal,
// la API (validacion/saneado) y la ficha del panel (mostrar/exportar).
// Une el formulario de texto de la agencia con el de onboarding-halomodels.netlify.app.

export type TipoCampo = "text" | "textarea" | "number" | "sino";

export type Campo = {
  id: string;
  label: string;
  tipo: TipoCampo;
  hint?: string;
  placeholder?: string;
  requerido?: boolean;
  min?: number; // minimo de caracteres (texto) o valor (number)
  max?: number; // maximo de caracteres (texto) o valor (number)
};

export type Seccion = {
  id: string;
  titulo: string;
  intro?: string;
  campos: Campo[];
  limites?: boolean; // muestra la lista de limites en esta seccion
};

export const LIMITES: Array<{ id: string; es: string; en: string }> = [
  { id: "anal", es: "Anal", en: "Anal" },
  { id: "oral", es: "Sexo oral", en: "Oral sex" },
  { id: "oral_sin_tragar", es: "Oral (sin tragar)", en: "Oral (no swallow)" },
  { id: "masturbacion", es: "Masturbación", en: "Masturbation" },
  { id: "juguetes", es: "Juguetes", en: "Toys" },
  { id: "pies", es: "Pies", en: "Feet content" },
  { id: "joi", es: "JOI", en: "JOI" },
  { id: "bdsm_suave", es: "BDSM suave", en: "BDSM (light)" },
  { id: "rating", es: "Valoraciones (rating)", en: "Dick rating" },
  { id: "bg", es: "Contenido chico/chica", en: "B/G content" },
  { id: "gg", es: "Contenido chica/chica", en: "G/G content" },
  { id: "trio", es: "Trío", en: "Threesome" },
  { id: "squirting", es: "Squirting", en: "Squirting" },
  { id: "dom", es: "Roleplay dominante", en: "Dom roleplay" },
  { id: "sub", es: "Roleplay sumisa", en: "Sub roleplay" },
];

export const SECCIONES: Seccion[] = [
  {
    id: "personaje",
    titulo: "Tu personaje",
    intro: "El nombre y los datos básicos que verá el público.",
    campos: [
      { id: "nombre", label: "Nombre artístico (cómo quieres que te llamemos)", tipo: "text", requerido: true, max: 60, placeholder: "Ej.: Rachel" },
      { id: "edad", label: "Edad", tipo: "number", requerido: true, min: 18, max: 99, placeholder: "Ej.: 25" },
      { id: "cumple", label: "Cumpleaños", tipo: "text", max: 60, placeholder: "Ej.: 14 de marzo" },
      { id: "origen", label: "País de origen", tipo: "text", requerido: true, max: 80, placeholder: "Ej.: Venezuela" },
      { id: "pais", label: "País donde vives", tipo: "text", requerido: true, max: 80, placeholder: "Ej.: Argentina" },
      { id: "ciudad", label: "Ciudad donde vives", tipo: "text", requerido: true, max: 80, placeholder: "Ej.: Rosario" },
      { id: "ocupacion", label: "Ocupación", tipo: "text", max: 120, placeholder: "Ej.: estudiante de diseño" },
      { id: "etnia", label: "Etnia / nacionalidad", tipo: "text", max: 120 },
      { id: "acento", label: "Acento / idiomas que hablas", tipo: "text", max: 160, placeholder: "Ej.: español (acento rioplatense), inglés básico" },
    ],
  },
  {
    id: "personalidad",
    titulo: "Tu personalidad y estilo",
    intro: "Cómo quieres que te perciban tus seguidores.",
    campos: [
      {
        id: "estilo",
        label: "¿Qué tipo de personaje te gustaría ser?",
        tipo: "textarea",
        requerido: true,
        min: 20,
        max: 600,
        hint: "Con tus palabras: cómo quieres que te vean, qué actitud tienes, qué te hace diferente.",
        placeholder: "Ej.: La chica de al lado, dulce y cercana, pero con un punto atrevido que sorprende.",
      },
      { id: "palabras", label: "Descríbete en 3 a 5 palabras", tipo: "text", requerido: true, max: 120, placeholder: "Ej.: dulce, divertida, algo coqueta" },
      { id: "personalidad", label: "Tipo de personalidad", tipo: "text", max: 200, placeholder: "Ej.: extrovertida, tímida al principio…" },
    ],
  },
  {
    id: "fisico",
    titulo: "Cómo eres y tu nicho",
    intro: "Datos físicos y el tipo de contenido en el que te sientes cómoda.",
    campos: [
      { id: "altura", label: "Altura", tipo: "text", max: 40, placeholder: "Ej.: 167 cm" },
      { id: "peso", label: "Peso", tipo: "text", max: 40, placeholder: "Ej.: 58 kg" },
      { id: "cuerpo", label: "Tipo de cuerpo", tipo: "text", max: 120, placeholder: "Ej.: delgada, curvy, atlética…" },
      { id: "pecho", label: "Talla de sujetador / pecho", tipo: "text", max: 60, placeholder: "Ej.: 90C" },
      { id: "pelo", label: "Color de pelo", tipo: "text", max: 60 },
      { id: "ojos", label: "Color de ojos", tipo: "text", max: 60 },
      {
        id: "fisico",
        label: "Tu descripción física",
        tipo: "textarea",
        requerido: true,
        min: 30,
        max: 500,
        hint: "Cabello, ojos, tipo de cuerpo, estatura, tatuajes, piercings. Deja fuera lo que no quieras que se mencione.",
        placeholder: "Ej.: Morena de cabello largo y ondulado, ojos marrones, 167 cm, tatuaje de una flor en la espalda.",
      },
      {
        id: "nicho",
        label: "¿En qué nicho te gustaría estar?",
        tipo: "textarea",
        requerido: true,
        min: 15,
        max: 600,
        hint: "Un nicho es el tipo de contenido y de público en el que te especializas. Ej.: novia virtual, fitness/gym, cosplay y gamer, alternativa con tatuajes, lencería elegante, latina natural y casera, pies. Puedes combinar varios o inventar el tuyo. Cuéntanos por qué te sientes cómoda ahí.",
      },
    ],
  },
  {
    id: "customs",
    titulo: "Customs y videollamadas",
    intro: "Qué ofreces a parte del contenido normal y a qué precio.",
    campos: [
      { id: "customs", label: "¿Haces customs?", tipo: "sino" },
      { id: "customs_info", label: "Info y límites de los customs", tipo: "textarea", max: 1500 },
      { id: "customs_precios", label: "Precios de customs", tipo: "textarea", max: 1500, placeholder: "Ej.: vídeo 1 min: 40 $, 3 min: 90 $…" },
      { id: "videollamadas", label: "¿Haces videollamadas?", tipo: "sino" },
      { id: "videollamadas_precios", label: "Precios de videollamadas", tipo: "textarea", max: 1000 },
      { id: "videollamadas_disponibilidad", label: "Disponibilidad para videollamadas", tipo: "textarea", max: 1000, placeholder: "Ej.: lunes a viernes de 18:00 a 22:00 (hora de Argentina)" },
    ],
  },
  {
    id: "limites",
    titulo: "Tus límites",
    intro: "Marca solo lo que nunca harías en contenido personalizado. Lo que no marques se entiende como negociable. Tus límites los decides tú y puedes cambiarlos cuando quieras: solo avísanos.",
    limites: true,
    campos: [
      {
        id: "otros_limites",
        label: "Otros límites que no estén en la lista",
        tipo: "textarea",
        requerido: true,
        min: 2,
        max: 600,
        hint: 'Si no tienes ninguno más, escribe "Ninguno".',
        placeholder: "Ej.: no mostrar la cara, no hablar de mi familia…",
      },
      { id: "limites_contenido", label: "Límites de contenido (detalle)", tipo: "textarea", max: 1500, placeholder: "Cualquier explicación extra sobre lo que sí y lo que no haces." },
    ],
  },
  {
    id: "vida",
    titulo: "Tu vida y gustos",
    intro: "Para que las conversaciones con tus fans se sientan naturales.",
    campos: [
      { id: "hobbies", label: "Hobbies / intereses", tipo: "textarea", max: 600 },
      { id: "comida", label: "Comida favorita", tipo: "text", max: 120 },
      { id: "libro", label: "Libro favorito", tipo: "text", max: 120 },
      { id: "serie", label: "Serie favorita", tipo: "text", max: 120 },
      { id: "pelicula", label: "Película favorita", tipo: "text", max: 120 },
      { id: "estilo_vida", label: "Estilo de vida (rutina diaria, trabajo, estudios…)", tipo: "textarea", max: 800 },
      { id: "relacion", label: "Estado sentimental (si es relevante para el personaje)", tipo: "text", max: 200 },
    ],
  },
  {
    id: "historia",
    titulo: "Tu historia y redes",
    intro: "Lo que tus fans pueden saber de ti: de dónde vienes, qué te gusta, tus planes favoritos, tu día a día.",
    campos: [
      {
        id: "historia",
        label: "Cuéntanos sobre ti",
        tipo: "textarea",
        requerido: true,
        min: 80,
        max: 1500,
        placeholder: "Ej.: Nací en Venezuela y vivo en Argentina. Soy dulce y divertida. Me encanta el café, la música latina, las caminatas al atardecer y probar recetas nuevas…",
      },
      { id: "instagram", label: "Instagram (si es orgánico)", tipo: "text", max: 120, placeholder: "@usuario" },
      { id: "twitter", label: "Twitter / X", tipo: "text", max: 120, placeholder: "@usuario" },
      { id: "tiktok", label: "TikTok", tipo: "text", max: 120, placeholder: "@usuario" },
      { id: "otras_redes", label: "Otras redes", tipo: "text", max: 300 },
      { id: "notas_extra", label: "Notas extra", tipo: "textarea", max: 2000 },
    ],
  },
];

export type DatosOnboarding = Record<string, string | string[] | boolean | undefined> & {
  limites?: string[];
  revisado?: boolean;
};

export const TODOS_LOS_CAMPOS: Campo[] = SECCIONES.flatMap((s) => s.campos);
const MAX_POR_DEFECTO = 3000;

/** Deja solo campos conocidos, con tipos correctos y longitudes acotadas. Nunca inventa datos. */
export function sanearDatos(raw: unknown): DatosOnboarding {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: DatosOnboarding = {};
  for (const campo of TODOS_LOS_CAMPOS) {
    const v = src[campo.id];
    if (v === undefined || v === null) continue;
    const texto = String(v).trim();
    if (!texto) continue;
    if (campo.tipo === "sino") {
      if (texto === "si" || texto === "no") out[campo.id] = texto;
    } else {
      out[campo.id] = texto.slice(0, campo.max && campo.tipo !== "number" ? campo.max : MAX_POR_DEFECTO);
    }
  }
  const validos = new Set(LIMITES.map((l) => l.id));
  const lim = Array.isArray(src.limites) ? src.limites.map(String).filter((id) => validos.has(id)) : [];
  out.limites = Array.from(new Set(lim));
  out.revisado = src.revisado === true;
  return out;
}

export type ErroresOnboarding = Record<string, string>;

/** Validacion para ENVIAR (el borrador se guarda siempre, aunque este incompleto). */
export function validarOnboarding(datos: DatosOnboarding): ErroresOnboarding {
  const errores: ErroresOnboarding = {};
  for (const campo of TODOS_LOS_CAMPOS) {
    if (!campo.requerido) continue;
    const v = String(datos[campo.id] ?? "").trim();
    if (!v) {
      errores[campo.id] = "Este campo es obligatorio.";
      continue;
    }
    if (campo.tipo === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) errores[campo.id] = "Escríbelo en números.";
      else if (campo.min !== undefined && n < campo.min) errores[campo.id] = campo.id === "edad" ? "Tienes que tener 18 años o más." : `Mínimo ${campo.min}.`;
      else if (campo.max !== undefined && n > campo.max) errores[campo.id] = "Revisa el valor.";
    } else if (campo.min !== undefined && v.length < campo.min) {
      errores[campo.id] = `Cuéntanos un poco más (mínimo ${campo.min} caracteres).`;
    }
  }
  if (datos.revisado !== true) errores.revisado = "Confirma que has revisado la lista de límites.";
  return errores;
}

/** Progreso 0-100 sobre los campos obligatorios + confirmacion de limites. */
export function progresoOnboarding(datos: DatosOnboarding): number {
  const requeridos = TODOS_LOS_CAMPOS.filter((c) => c.requerido);
  const total = requeridos.length + 1;
  const hechos = requeridos.filter((c) => String(datos[c.id] ?? "").trim()).length + (datos.revisado === true ? 1 : 0);
  return Math.round((hechos / total) * 100);
}

export function seccionDeCampo(campoId: string): number {
  if (campoId === "revisado") return SECCIONES.findIndex((s) => s.limites);
  return SECCIONES.findIndex((s) => s.campos.some((c) => c.id === campoId));
}

export function valorLegible(campo: Campo, datos: DatosOnboarding): string {
  const v = datos[campo.id];
  if (v === undefined || v === "") return "";
  if (campo.tipo === "sino") return v === "si" ? "Sí" : v === "no" ? "No" : "";
  return String(v);
}

/** Texto plano completo (para copiar / descargar desde el panel). */
export function onboardingATexto(nombreModelo: string, datos: DatosOnboarding): string {
  const lineas: string[] = [`ONBOARDING · ${nombreModelo.toUpperCase()}`, ""];
  for (const s of SECCIONES) {
    lineas.push(`== ${s.titulo.toUpperCase()} ==`);
    for (const c of s.campos) {
      const v = valorLegible(c, datos);
      lineas.push(`${c.label}: ${v || "—"}`);
    }
    if (s.limites) {
      const marcados = (datos.limites ?? []).map((id) => LIMITES.find((l) => l.id === id)).filter(Boolean);
      lineas.push("Límites marcados (NO hace):");
      lineas.push(marcados.length ? marcados.map((l) => `• ${l!.en} (${l!.es})`).join("\n") : "• Ninguno de la lista");
      lineas.push(`Lista de límites revisada: ${datos.revisado ? "Sí" : "No"}`);
    }
    lineas.push("");
  }
  return lineas.join("\n").trim() + "\n";
}
