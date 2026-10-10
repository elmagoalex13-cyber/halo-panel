// Resumen corto del contrato en lenguaje llano, para que la modelo lo entienda antes de firmar (email y pagina de firma).
// Dice lo mismo que el contrato; el texto completo esta siempre al lado, justo debajo.

export const RESUMEN_ESENCIAL: Array<{ icono: string; titulo: string; texto: string }> = [
  { icono: "🤝", titulo: "Qué hacemos por ti", texto: "Abrimos y gestionamos tus cuentas, editamos tu contenido, hacemos la publicidad y te damos soporte por WhatsApp." },
  { icono: "💶", titulo: "Cómo se reparte lo que se gana", texto: "70 % para la agencia y 30 % para ti, sobre lo que se cobra de verdad (tras las comisiones de la plataforma y los gastos que apruebes). Te pagamos los días 1 y 15, con un resumen de ingresos." },
  { icono: "🎬", titulo: "Qué haces tú", texto: "Grabas el contenido acordado, sigues las directrices y respondes en tiempos razonables. Mientras dure el contrato, no trabajas con otra agencia." },
  { icono: "🔑", titulo: "Tus cuentas", texto: "Tienes acceso a tus cuentas de OnlyFans y de cobro (Skrill, banco…) durante todo el contrato, y al terminar te entregamos todas sus credenciales. Las redes sociales (Instagram, TikTok, Telegram…) las gestiona y son de la agencia." },
  { icono: "🚪", titulo: "Si quieres salir", texto: "Sin permanencia: cualquiera de las dos partes puede terminar el contrato avisando por escrito con 14 días." },
];

// Las primeras son las dudas que mas aparecen antes de firmar (reparto, cobro, ver ingresos, pedidos de contenido).
export const PREGUNTAS_FRECUENTES: Array<{ p: string; r: string }> = [
  { p: "¿El 70-30 es negociable? ¿Se mantiene siempre así?", r: "Empezamos con el reparto del contrato: 70 % para la agencia y 30 % para ti. Se puede hablar caso a caso y, más adelante, cuando haya resultados, se puede revisar. Cualquier cambio se acuerda por escrito y firmado por las dos partes: hasta entonces, vale lo que firmas." },
  { p: "¿Dónde y cada cuánto cobro?", r: "Los días 1 y 15 de cada mes, por Skrill o criptomonedas, una vez la agencia ha recibido los fondos de la plataforma. Con cada pago te enviamos un resumen de ingresos." },
  { p: "¿Puedo ver lo que se va generando?", r: "Sí. Tienes acceso a tu cuenta de OnlyFans durante todo el contrato y ves ahí los ingresos y el movimiento. Además, con cada pago recibes el resumen de ingresos." },
  { p: "¿Cómo son los pedidos de contenido?", r: "Te pedimos contenido por tandas: vídeos cortos para Instagram (con una referencia de qué grabar) y contenido para OnlyFans (scripts, packs de fotos y posts) siguiendo una guía. Al empezar se pide una primera tanda para preparar tus cuentas; después, lo que toca lo ves en tu portal y te avisamos por Telegram. Los formatos, plazos y la calidad los acordamos con el equipo." },
  { p: "¿Tengo que quedarme un tiempo mínimo?", r: "No hay permanencia: el contrato es indefinido y cualquiera de las dos partes puede terminarlo avisando por escrito con 14 días naturales." },
  { p: "¿Qué pasa con mis cuentas de OnlyFans y de cobro?", r: "Las tienes a tu disposición durante todo el contrato y, al terminar, la agencia te entrega todas las credenciales en un máximo de 7 días hábiles." },
  { p: "¿Y con las cuentas de Instagram, TikTok o Telegram?", r: "Son de la agencia: se gestionan por ella y no se transfieren. Al terminar, tu contenido se va eliminando de ellas." },
  { p: "¿Qué pasa si no puedo grabar durante unos días?", r: "Avísanos con antelación. Lo que el contrato considera abandono son más de 5 días hábiles sin responder y sin causa." },
];
