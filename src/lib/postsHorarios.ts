// Horarios de publicacion de los posts de OnlyFans (hora de Madrid). Tres franjas: mañana, comida y tarde; NUNCA mas tarde de las 19:00.
const VENTANAS: Array<[number, number, number, number]> = [
  [8, 0, 10, 0], // mañana
  [13, 0, 15, 0], // comida
  [17, 0, 19, 0], // tarde (como mucho las 19:00)
];

const partesMadrid = (t: number) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(t))
      .map((x) => [x.type, Number(x.value)]),
  );
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute };
};

/** Fecha y hora de Madrid -> instante UTC (gestiona el cambio de hora de verano). */
export function madridAUtc(y: number, m: number, d: number, h: number, mi: number): Date {
  let t = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const v = partesMadrid(t);
    const como = Date.UTC(v.y, v.m - 1, v.d, v.h, v.mi);
    t -= como - Date.UTC(y, m - 1, d, h, mi);
  }
  return new Date(t);
}

/** Dia (en Madrid) de un instante, como numero de dias desde 1970 (para sumar dias sin lios de horario). */
const diaMadrid = (t: number) => {
  const v = partesMadrid(t);
  return Math.floor(Date.UTC(v.y, v.m - 1, v.d) / 86400000);
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * Los proximos `n` huecos de publicacion de una modelo: uno cada `cadaDias` dias, empezando MAÑANA (o `cadaDias` despues del ultimo
 * programado). La franja rota (mañana / comida / tarde) y el minuto sale de la propia fecha, asi no se publica siempre a la misma hora.
 */
export function proximosHuecos(modeloId: string, ultimo: Date | null, cadaDias: number, n: number, ahora = new Date()): Date[] {
  const paso = Math.max(1, Math.round(cadaDias));
  const manana = diaMadrid(ahora.getTime()) + 1;
  let dia = ultimo ? Math.max(manana, diaMadrid(ultimo.getTime()) + paso) : manana;
  const huecos: Date[] = [];
  for (let i = 0; i < n; i++, dia += paso) {
    const [h1, m1, h2, m2] = VENTANAS[(dia + hash(modeloId)) % VENTANAS.length];
    const inicio = h1 * 60 + m1;
    const fin = h2 * 60 + m2;
    const minuto = inicio + (hash(`${modeloId}|${dia}`) % (fin - inicio + 1)); // dentro de la franja, hasta las 19:00 como mucho
    const f = new Date(dia * 86400000);
    huecos.push(madridAUtc(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), Math.floor(minuto / 60), minuto % 60));
  }
  return huecos;
}
