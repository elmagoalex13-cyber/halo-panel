// Mensajes predeterminados para contactar con los leads. Hay dos: uno para quien ha subido fotos en el formulario y otro para
// pedirselas a quien no las ha subido. Se escriben una vez (se guardan en panel_config) y solo cambia el nombre: {nombre}.

export type PlantillasLeads = { con_fotos: string; sin_fotos: string };

export const CLAVE_PLANTILLAS_LEADS = "leads_plantillas";

export const PLANTILLAS_POR_DEFECTO: PlantillasLeads = {
  con_fotos:
    "Hola {nombre}! 👋 Te escribimos de Halo Models. Hemos visto tu solicitud y tus fotos y nos han gustado mucho. Nos encantaría hablar contigo para contarte cómo trabajamos y cómo podríamos ayudarte a crecer. ¿Tienes un momento para hablar?",
  sin_fotos:
    "Hola {nombre}! 👋 Te escribimos de Halo Models. Hemos recibido tu solicitud y nos interesa tu perfil. Para poder valorarlo necesitamos que nos envíes unas fotos tuyas (naturales, de cara y de cuerpo entero, con buena luz). ¿Nos las mandas por aquí? 😊",
};

/** Primer nombre del lead con la inicial en mayuscula ("maría lópez" -> "María"). */
export function primerNombre(nombre: string | null | undefined) {
  const p = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toLocaleUpperCase("es-ES") + p.slice(1) : "";
}

/** Cambia {nombre} por el nombre del lead (si no tiene, se quita sin dejar espacios raros: "Hola {nombre}!" -> "Hola!"). */
export function rellenarMensaje(plantilla: string, nombre: string | null | undefined) {
  const n = primerNombre(nombre);
  return n ? plantilla.replace(/\{nombre\}/gi, n) : plantilla.replace(/\s*\{nombre\}/gi, "");
}
