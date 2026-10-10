// Mensajes predeterminados para contactar con los leads. Hay dos: uno para quien ha subido fotos en el formulario y otro para
// pedirselas a quien no las ha subido. Se escriben una vez (se guardan en panel_config) y solo cambia el nombre: {nombre}.

export type PlantillasLeads = { con_fotos: string; sin_fotos: string };

export const CLAVE_PLANTILLAS_LEADS = "leads_plantillas";

export const PLANTILLAS_POR_DEFECTO: PlantillasLeads = {
  con_fotos:
    "Hola, {nombre}. Hemos recibido tu solicitud a través de nuestra web para aplicar como modelo.\n\nNos gustaría conocerte un poco mejor y explicarte cómo trabajamos.\n\n¿Tendrías disponibilidad para agendar una breve llamada con nosotros?",
  sin_fotos:
    "Hola, {nombre}. Hemos recibido tu solicitud para aplicar como modelo a través de nuestra web.\n\nGracias por ponerte en contacto con nosotros. Nos gustaría conocer un poco más tu perfil antes de pasar a la siguiente fase.\n\nCuando puedas, envíanos por aquí algunas fotos recientes tuyas para que el equipo pueda hacer una primera valoración. Después podemos organizar una llamada y contarte cómo funciona todo.",
};

/** Primer nombre del lead con la inicial en mayuscula ("maría lópez" -> "María"). */
export function primerNombre(nombre: string | null | undefined) {
  const p = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toLocaleUpperCase("es-ES") + p.slice(1) : "";
}

/** Cambia {nombre} por el nombre del lead (si no tiene, se quita sin dejar comas ni espacios raros: "Hola, {nombre}." -> "Hola."). */
export function rellenarMensaje(plantilla: string, nombre: string | null | undefined) {
  const n = primerNombre(nombre);
  return n ? plantilla.replace(/\{nombre\}/gi, n) : plantilla.replace(/,?[ \t]*\{nombre\}/gi, "");
}
