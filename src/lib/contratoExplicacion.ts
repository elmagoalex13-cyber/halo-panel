// Explicacion del contrato en lenguaje llano, para que la modelo lo entienda antes de firmar (email y pagina de firma).
// Reglas: dice lo mismo que el contrato (nada de promesas que no estan en el texto) y no esconde lo que pesa: cuentas, exclusividad,
// abandono, limite de responsabilidad. Una persona que entiende lo que firma firma con confianza y se queda: eso convierte mejor.

export const RESUMEN_ESENCIAL: Array<{ icono: string; titulo: string; texto: string }> = [
  { icono: "🤝", titulo: "Qué hacemos por ti", texto: "Abrimos y gestionamos tus cuentas (Instagram, OnlyFans…), editamos tu contenido, hacemos la publicidad y la estrategia, y te damos soporte por WhatsApp." },
  { icono: "💶", titulo: "Cómo se reparte lo que se gana", texto: "70 % para la agencia y 30 % para ti, sobre lo que realmente se cobra (después de las comisiones de la plataforma y de los gastos que hayas aprobado). Te pagamos los días 1 y 15 de cada mes, con un resumen de ingresos." },
  { icono: "🎬", titulo: "Qué haces tú", texto: "Grabas el contenido acordado, sigues las directrices, respondes en tiempos razonables y no trabajas a la vez con otra agencia mientras dure el contrato." },
  { icono: "🔑", titulo: "De quién son las cuentas", texto: "Las cuentas donde cobras (OnlyFans, Skrill…) te las entregamos al terminar. Las cuentas de tráfico (Instagram, TikTok, Telegram…) son siempre de la agencia." },
  { icono: "🚪", titulo: "Si quieres salir", texto: "No hay permanencia: el contrato no tiene fecha de fin y cualquiera de las dos partes puede terminarlo avisando por escrito con 14 días." },
  { icono: "📈", titulo: "Lo que no prometemos", texto: "No garantizamos una cifra de ingresos ni de crecimiento: dependen de las plataformas, del mercado y del contenido. Trabajamos para que sea lo mejor posible." },
];

export type ExplicacionClausula = { n: number; claro: string; porque: string };

/** Por cada clausula: qué dice en cristiano y por qué está ahí. */
export const EXPLICACION_CLAUSULAS: ExplicacionClausula[] = [
  {
    n: 1,
    claro: "Es la lista de lo que hace la agencia por ti: crear y hacer crecer tus cuentas, publicidad, análisis, asesoramiento, edición de tu contenido y estrategia de crecimiento. La apertura y la gestión inicial de las cuentas corre de nuestra cuenta.",
    porque: "Para que sepas desde el primer día qué incluye el servicio y trabajemos con una estrategia coordinada.",
  },
  {
    n: 2,
    claro: "De lo que realmente entra (descontando las comisiones de la plataforma y los gastos que hayas aprobado antes), el 70 % es de la agencia y el 30 % tuyo. Se paga los días 1 y 15 de cada mes, con un resumen de ingresos. Ningún gasto extra se aplica sin tu aprobación expresa: si no estás de acuerdo, no se hace.",
    porque: "El 70 % cubre el trabajo y la inversión de la agencia (edición, publicidad, gestión de cuentas, soporte). Los pagos quincenales son para que no esperes un mes entero para cobrar.",
  },
  {
    n: 3,
    claro: "Lo que nos comprometemos a darte: soporte por WhatsApp en horarios razonables, ideas y recomendaciones de contenido, asesoramiento sobre las plataformas, edición de tus vídeos y gestión del tráfico y el crecimiento. Eso sí: no garantizamos resultados concretos de crecimiento, ingresos o viralidad.",
    porque: "Los resultados dependen de factores que no controlamos (cómo funcionan las plataformas, el mercado, la calidad del contenido). Preferimos decírtelo claro desde el principio.",
  },
  {
    n: 4,
    claro: "Lo que se espera de ti: entregar el contenido acordado con la calidad y los plazos pedidos, colaborar y responder, seguir las directrices, no publicar por tu cuenta en las cuentas que gestionamos sin permiso por escrito, no compartir accesos ni información interna y avisar de cualquier situación personal que afecte a tu disponibilidad. Mientras dure el contrato, no puedes trabajar a la vez con otra agencia o gestor.",
    porque: "Una estrategia solo funciona si todos tiran en la misma dirección. La exclusividad evita que dos equipos distintos pisen las mismas cuentas o contenidos.",
  },
  {
    n: 5,
    claro: "Cuentas donde cobras (OnlyFans, Skrill, Cosmo…): las crea y gestiona la agencia, y cuando el contrato termine te entregamos todas las credenciales en un máximo de 7 días hábiles. Cuentas de tráfico (Instagram, TikTok, Telegram y otras redes): son de la agencia, durante el contrato y después; no se transfieren ni se entregan sus accesos. Al terminar, iremos eliminando tu contenido de ellas poco a poco.",
    porque: "Las cuentas de tráfico son el motor con el que se capta audiencia y se construyen con el trabajo y la inversión de la agencia. Las que cobran dinero son las tuyas al terminar.",
  },
  {
    n: 6,
    claro: "Nos das permiso (no exclusivo) para usar y publicar el contenido que grabes durante el contrato, solo en las plataformas acordadas y para lo pactado: para otros fines, necesitamos tu consentimiento por escrito. Al terminar, lo que ya esté publicado en las plataformas donde cobras puede seguir ahí, salvo que pidas su retirada por escrito. También confirmas que eres mayor de edad y que puedes firmar.",
    porque: "Necesitamos poder publicar el contenido para trabajarlo. «No exclusivo» quiere decir que no pierdes tus derechos sobre él.",
  },
  {
    n: 7,
    claro: "El contrato no tiene fecha de fin. Cualquiera de las dos partes puede terminarlo avisando por escrito con 14 días naturales, y mientras tanto ambas seguimos cumpliendo con normalidad. El plazo es igual para ti y para la agencia.",
    porque: "No te atamos a un tiempo fijo: si deja de ir bien para cualquiera de las dos partes, se puede terminar con un plazo corto y el mismo para todos.",
  },
  {
    n: 8,
    claro: "Además del aviso de 14 días, se puede terminar de inmediato si hay un incumplimiento grave o conductas que dañen la imagen o la actividad de la otra parte. La agencia también puede hacerlo si se publica contenido sin autorización, si se contacta con suscriptores fuera de los canales gestionados o si se revela información confidencial.",
    porque: "Protege a las dos partes si ocurre algo serio, sin tener que esperar al aviso.",
  },
  {
    n: 9,
    claro: "Si pasas más de 5 días hábiles seguidos sin responder, o dejas de entregar contenido mucho tiempo sin explicación, la agencia puede dar el contrato por terminado por abandono. En ese caso no se pagan cantidades pendientes del periodo de abandono.",
    porque: "Si no hay comunicación, no podemos gestionar nada. Por eso te pedimos que avises si vas a estar unos días sin poder: enfermedad, viaje… así no pasa nada.",
  },
  {
    n: 10,
    claro: "Las dos partes guardamos confidencialidad sobre estrategias, datos de cuentas, ingresos, procesos y métodos de captación. Tú no puedes reutilizar ni compartir los sistemas y materiales internos de la agencia, ni siquiera cuando termine el contrato. Y ninguna de las dos hablará mal en público de la otra, ni durante ni después.",
    porque: "Lo que trabajamos juntas (estrategias, resultados, ingresos) es sensible para las dos. El respeto en público también protege tu imagen, no solo la nuestra.",
  },
  {
    n: 11,
    claro: "Si incumples el contrato o usas mal contenido, cuentas o material protegido y eso causa una reclamación o un daño, respondes por ello.",
    porque: "Para que un incumplimiento grave tenga consecuencias claras. Si cumples lo acordado, esta cláusula no te afecta.",
  },
  {
    n: 12,
    claro: "La agencia no garantiza ingresos concretos. Si hubiera una reclamación contra la agencia, el máximo que podría exigirse es lo que se te haya pagado en el mes anterior al hecho; no se cubre el lucro cesante ni los daños indirectos. Cualquier reclamación debe hacerse por escrito en un máximo de 30 días desde que sepas del hecho.",
    porque: "Pone un límite claro al riesgo de las dos partes, porque los ingresos dependen de factores externos. Si algo no te cuadra, reclama pronto y por escrito.",
  },
  {
    n: 13,
    claro: "La agencia lleva las cuentas y las estrategias con autonomía profesional y tú no interfieres en esas decisiones. Cualquier gasto extraordinario (producción especial, herramientas de pago, publicidad de pago…) solo se hace si lo acordáis las dos por escrito.",
    porque: "Para que las decisiones del día a día no se bloqueen, y para que nunca haya un gasto que no hayas aceptado.",
  },
  {
    n: 14,
    claro: "El contrato se rige por la ley española y, si hubiera una discusión que no se pueda resolver hablando, se resolvería en los juzgados de Madrid.",
    porque: "Es lo que hace falta para que haya un marco legal claro y conocido.",
  },
  {
    n: 15,
    claro: "Este documento es todo el acuerdo y sustituye a cualquier acuerdo anterior, hablado o escrito. Cualquier cambio tiene que hacerse por escrito y firmado por las dos partes. Si una cláusula resultara inválida, el resto sigue en vigor.",
    porque: "Para que lo que vale sea lo que está escrito aquí, sin malentendidos sobre lo que se dijo de palabra.",
  },
];

export const PREGUNTAS_FRECUENTES: Array<{ p: string; r: string }> = [
  { p: "¿Cuándo cobro?", r: "Los días 1 y 15 de cada mes, una vez la agencia haya recibido los fondos de la plataforma, y con un resumen de ingresos." },
  { p: "¿Tengo que quedarme un tiempo mínimo?", r: "No hay permanencia: el contrato es indefinido y cualquiera de las dos partes puede terminarlo avisando por escrito con 14 días naturales." },
  { p: "¿Me quedo con mis cuentas de OnlyFans y Skrill?", r: "Sí: al terminar el contrato, la agencia te entrega todas las credenciales de esas cuentas en un máximo de 7 días hábiles." },
  { p: "¿Y con las cuentas de Instagram o TikTok?", r: "Esas son de la agencia (cuentas de tráfico): no se transfieren. Al terminar, tu contenido se va eliminando de ellas." },
  { p: "¿Me pueden cobrar gastos sin avisar?", r: "No. Ningún gasto operativo se aplica sin tu aprobación expresa; si no hay acuerdo, no se realiza." },
  { p: "¿Qué pasa si no puedo grabar durante unos días?", r: "Avísanos con antelación de cualquier situación que afecte a tu disponibilidad. Lo que prevé el contrato como abandono son más de 5 días hábiles sin responder y sin causa." },
];
