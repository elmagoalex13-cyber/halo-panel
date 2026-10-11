// Resumen corto del contrato en lenguaje llano y preguntas frecuentes, para que la modelo lo entienda todo antes de firmar
// (email y pagina de firma). Dice lo mismo que el contrato, clausula por clausula; el PDF con el texto completo esta siempre al lado.

export const RESUMEN_ESENCIAL: Array<{ icono: string; titulo: string; texto: string }> = [
  { icono: "🤝", titulo: "Qué hacemos por ti", texto: "Abrimos y gestionamos tus cuentas, editamos tu contenido, hacemos la publicidad y te damos soporte por WhatsApp." },
  { icono: "💶", titulo: "Cómo se reparte lo que se gana", texto: "Los primeros 6 meses desde tu inicio efectivo, 70 % para la agencia y 30 % para ti. Desde el mes 7, pasa a 60 % agencia y 40 % para ti. Sobre lo que se cobra de verdad (tras las comisiones de la plataforma y los gastos que apruebes). Te pagamos los días 1 y 15, con un resumen de ingresos." },
  { icono: "🎬", titulo: "Qué haces tú", texto: "Entregas el contenido inicial en un máximo de 2 semanas desde la firma (como mínimo 30 reels, 4 scripts y 5 packs de fotos de contenido explícito, y 30 posts para OnlyFans), sigues las directrices y respondes en tiempos razonables. Mientras dure el contrato, no trabajas con otra agencia." },
  { icono: "🔑", titulo: "Tus cuentas", texto: "Tienes acceso a tus cuentas de OnlyFans y de cobro (Skrill, banco…) durante todo el contrato, y al terminar te entregamos todas sus credenciales. Las redes sociales (Instagram, TikTok, Telegram…) las gestiona y son de la agencia." },
  { icono: "🚪", titulo: "Si quieres salir", texto: "Sin permanencia: cualquiera de las dos partes puede terminar el contrato avisando por escrito con 14 días." },
];

export type GrupoPreguntas = { titulo: string; preguntas: Array<{ p: string; r: string }> };

export const PREGUNTAS_FRECUENTES: GrupoPreguntas[] = [
  {
    titulo: "💶 Dinero",
    preguntas: [
      {
        p: "¿Cómo se reparte lo que se genera?",
        r: "El reparto se hace sobre los ingresos que realmente se cobran, una vez descontadas las comisiones propias de la plataforma y los gastos operativos que se hayan acordado contigo antes. Durante los primeros 6 meses desde tu inicio efectivo es 70 % para la agencia y 30 % para ti. A partir del mes 7 pasa a 60 % para la agencia y 40 % para ti. El cambio se aplica solo, al empezar el séptimo mes natural, sin que tengas que pedir ni firmar nada.",
      },
      {
        p: "¿El 70-30 es negociable? ¿Se mantiene siempre así?",
        r: "No se queda siempre igual: sube a 60-40 a tu favor a partir del mes 7. Si quieres hablar de otro reparto, se puede hablar caso a caso; cualquier cambio sobre lo que firmas se acuerda por escrito y firmado por las dos partes.",
      },
      {
        p: "¿Dónde y cada cuánto cobro?",
        r: "Los días 1 y 15 de cada mes, por Skrill o criptomonedas, una vez la agencia ha recibido los fondos de la plataforma. Con cada pago te enviamos un resumen de ingresos.",
      },
      {
        p: "¿Puedo ver lo que se va generando?",
        r: "Sí. Tienes acceso a tu cuenta de OnlyFans durante todo el contrato y ves ahí los ingresos y el movimiento. Además, con cada pago recibes el resumen de ingresos.",
      },
      {
        p: "¿Me pueden cobrar gastos sin avisar?",
        r: "No. Ningún gasto operativo se aplica sin tu aprobación expresa; si no hay acuerdo, no se realiza. Y cualquier gasto extraordinario (producción especial, herramientas de pago, publicidad de pago…) solo se hace si lo acordáis las dos por escrito.",
      },
    ],
  },
  {
    titulo: "🚀 Empezar",
    preguntas: [
      {
        p: "¿Cuándo empieza a contar el contrato?",
        r: "Desde el inicio efectivo: el día en que nos entregas todo el contenido inicial necesario para empezar. Tienes un máximo de 2 semanas desde la firma para entregarlo, y la agencia te comunica por escrito esa fecha cuando lo recibe. Los 6 meses del 70-30 se cuentan desde ahí.",
      },
      {
        p: "¿Qué tengo que entregar al empezar?",
        r: "El contenido inicial que pide la agencia, como mínimo: 30 reels para redes sociales (vídeos hablando a cámara y vídeos de contenido, según las indicaciones de la agencia), 4 scripts de contenido explícito, 5 packs de fotos de contenido explícito (según las indicaciones) y 30 posts para OnlyFans, que incluirán tanto contenido de lencería como contenido explícito. Tienes un máximo de 2 semanas desde la firma para entregarlo todo.",
      },
      {
        p: "¿Cómo son los pedidos de contenido después?",
        r: "Te pedimos contenido por tandas: vídeos cortos para Instagram (con una referencia de qué grabar) y contenido para OnlyFans (scripts, packs de fotos y posts) siguiendo una guía. Lo que toca lo ves en tu portal y te avisamos por Telegram. Los formatos, plazos y la calidad los acordamos con el equipo.",
      },
    ],
  },
  {
    titulo: "🔑 Cuentas y contenido",
    preguntas: [
      {
        p: "¿Qué pasa con mis cuentas de OnlyFans y de cobro?",
        r: "Las tienes a tu disposición durante todo el contrato y, al terminar, la agencia te entrega todas las credenciales en un máximo de 7 días hábiles.",
      },
      {
        p: "¿Y con las cuentas de Instagram, TikTok o Telegram?",
        r: "Son de la agencia: las crea, las desarrolla y las mantiene ella, y siguen siendo suyas siempre; no se transfieren ni se entregan sus accesos, ni durante el contrato ni después. Al terminar, tu contenido se va eliminando de ellas poco a poco, sin una fecha fija.",
      },
      {
        p: "¿De quién es el contenido que grabo?",
        r: "Le das a la agencia permiso de uso y publicación (no exclusivo) sobre el contenido que grabes durante el contrato, solo en las plataformas acordadas. La agencia no puede usarlo para otros fines sin tu consentimiento por escrito. Al terminar, lo que ya esté publicado en las plataformas donde cobras puede seguir ahí, salvo que pidas su retirada por escrito.",
      },
      {
        p: "¿Puedo publicar por mi cuenta o trabajar con otra agencia?",
        r: "Mientras dure el contrato, no puedes trabajar a la vez con otra agencia, agencia de representación o gestor externo sin autorización expresa de la agencia, ni publicar de forma autónoma en las cuentas que gestiona la agencia sin su autorización previa por escrito. Tampoco puedes compartir accesos ni información interna.",
      },
    ],
  },
  {
    titulo: "🚪 Salir y reglas del juego",
    preguntas: [
      {
        p: "¿Tengo que quedarme un tiempo mínimo? ¿Cómo salgo?",
        r: "No hay permanencia: el contrato es indefinido y cualquiera de las dos partes puede terminarlo avisando por escrito con 14 días naturales (el mismo plazo para las dos), y mientras tanto se sigue cumpliendo con normalidad. También se puede terminar de inmediato por un incumplimiento grave o por conductas que dañen la imagen o la actividad de la otra parte. La agencia puede además terminarlo de inmediato si se publica contenido sin autorización, se contacta con suscriptores fuera de los canales gestionados o se revela información confidencial.",
      },
      {
        p: "¿Qué pasa si no puedo grabar durante unos días?",
        r: "Avísanos con antelación de cualquier situación personal que afecte a tu disponibilidad. Lo que el contrato considera abandono son más de 5 días hábiles seguidos sin responder y sin causa justificada, o dejar de entregar contenido mucho tiempo sin explicación: en ese caso la agencia puede dar el contrato por terminado y no se pagan cantidades pendientes del periodo de abandono.",
      },
      {
        p: "¿Hay garantía de ingresos?",
        r: "No. Los ingresos dependen de factores externos (cómo funcionan las plataformas, el mercado y la calidad del contenido), así que la agencia no garantiza resultados concretos de crecimiento, ingresos o viralidad. Se compromete a trabajar con criterios profesionales y estratégicos.",
      },
      {
        p: "¿Y si hay un problema o una reclamación?",
        r: "Si incumples el contrato o usas indebidamente contenido, cuentas o material protegido y eso causa una reclamación o un daño, respondes por ello. Si la reclamación es contra la agencia, lo máximo que podría exigirse es lo que se te haya abonado en el mes anterior al hecho, y no se cubren el lucro cesante ni los daños indirectos. Cualquier reclamación debe hacerse por escrito en un máximo de 30 días desde que sepas del hecho.",
      },
      {
        p: "¿Qué es confidencial?",
        r: "Las dos partes guardamos secreto sobre estrategias digitales, datos de cuentas, ingresos, procesos internos, métodos de captación, contenido e información comercial. Tú no puedes reutilizar ni compartir los sistemas o materiales internos de la agencia ni después de terminar. Y ninguna de las dos partes hará declaraciones públicas ni comentarios en redes que dañen la imagen de la otra, ni durante el contrato ni después.",
      },
      {
        p: "¿Qué ley se aplica? ¿Puedo cambiar algo del contrato?",
        r: "Se rige por la ley española y, ante una discusión que no se pueda resolver hablando, los juzgados de Madrid. Este documento es todo el acuerdo y sustituye a cualquier acuerdo anterior, hablado o escrito: cualquier cambio debe hacerse por escrito y firmado por las dos partes. Y al firmar confirmas que eres mayor de edad y que tienes plena capacidad para firmar.",
      },
    ],
  },
];
