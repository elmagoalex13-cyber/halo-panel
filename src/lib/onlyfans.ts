// Contenido de OnlyFans: estructura de los scripts (8 fases, de la "Guia de scripts") y utilidades comunes.
// Seguro para cliente y servidor (sin dependencias de servidor).

export type SlotId = "video" | "foto" | "foto_relajada" | "foto_explicita";

export type SlotFase = {
  slot: SlotId;
  tipo: "video" | "foto";
  etiqueta: string; // "Vídeo", "Fotos"...
  n: number; // cuantos archivos se piden
  ayuda?: string;
  minSeg?: number; // solo videos: duracion orientativa (aviso, no bloquea)
  maxSeg?: number;
};

export type FaseScript = {
  fase: number;
  nombre: string;
  resumen: string; // lo pedido, en corto
  slots: SlotFase[];
};

export const FASES: FaseScript[] = [
  {
    fase: 1,
    nombre: "Teaser",
    resumen: "1 foto + 1 vídeo breve (5-10 s)",
    slots: [
      { slot: "video", tipo: "video", etiqueta: "Vídeo", n: 1, ayuda: "5-10 s enseñando cómo estás", minSeg: 4, maxSeg: 12 },
      { slot: "foto", tipo: "foto", etiqueta: "Foto", n: 1, ayuda: "Lencería muy coqueta, selfie sencilla" },
    ],
  },
  {
    fase: 2,
    nombre: "Calentamiento",
    resumen: "1 vídeo (~2 min) + 2 fotos",
    slots: [
      { slot: "video", tipo: "video", etiqueta: "Vídeo", n: 1, ayuda: "~2 min", minSeg: 100, maxSeg: 150 },
      { slot: "foto", tipo: "foto", etiqueta: "Fotos", n: 2, ayuda: "Provocativas (insinuantes)" },
    ],
  },
  {
    fase: 3,
    nombre: "Desnudo superior",
    resumen: "1 vídeo (2 min mínimo) + 4 fotos",
    slots: [
      { slot: "video", tipo: "video", etiqueta: "Vídeo", n: 1, ayuda: "2 min como mínimo", minSeg: 110 },
      { slot: "foto", tipo: "foto", etiqueta: "Fotos", n: 4, ayuda: "Relacionadas con el vídeo" },
    ],
  },
  {
    fase: 4,
    nombre: "Desnudo completo",
    resumen: "1 vídeo (2-2,5 min) + 4 fotos",
    slots: [
      { slot: "video", tipo: "video", etiqueta: "Vídeo", n: 1, ayuda: "2-2,5 min", minSeg: 110, maxSeg: 165 },
      { slot: "foto", tipo: "foto", etiqueta: "Fotos", n: 4, ayuda: "Relacionadas con el vídeo" },
    ],
  },
  {
    fase: 5,
    nombre: "Masturbación superficial",
    resumen: "1 vídeo (2,5-3 min) + 4 fotos",
    slots: [
      { slot: "video", tipo: "video", etiqueta: "Vídeo", n: 1, ayuda: "2,5-3 min", minSeg: 140, maxSeg: 195 },
      { slot: "foto", tipo: "foto", etiqueta: "Fotos", n: 4, ayuda: "Relacionadas con el vídeo" },
    ],
  },
  {
    fase: 6,
    nombre: "Masturbación intensa",
    resumen: "1 vídeo (3-3,5 min) + 4 fotos",
    slots: [
      { slot: "video", tipo: "video", etiqueta: "Vídeo", n: 1, ayuda: "3-3,5 min", minSeg: 170, maxSeg: 225 },
      { slot: "foto", tipo: "foto", etiqueta: "Fotos", n: 4, ayuda: "Relacionadas con el vídeo" },
    ],
  },
  {
    fase: 7,
    nombre: "Orgasmo",
    resumen: "1 vídeo (4-5 min) + 4 fotos",
    slots: [
      { slot: "video", tipo: "video", etiqueta: "Vídeo", n: 1, ayuda: "4-5 min", minSeg: 225, maxSeg: 320 },
      { slot: "foto", tipo: "foto", etiqueta: "Fotos", n: 4, ayuda: "Relacionadas con el vídeo" },
    ],
  },
  {
    fase: 8,
    nombre: "Aftercare (cierre)",
    resumen: "1 vídeo corto (10-15 s) + 2 fotos relajadas + 2 fotos explícitas",
    slots: [
      { slot: "video", tipo: "video", etiqueta: "Vídeo", n: 1, ayuda: "10-15 s", minSeg: 8, maxSeg: 20 },
      { slot: "foto_relajada", tipo: "foto", etiqueta: "Fotos relajadas", n: 2 },
      { slot: "foto_explicita", tipo: "foto", etiqueta: "Fotos explícitas", n: 2, ayuda: "Cuerpo completo" },
    ],
  },
];

export const faseDe = (n: number) => FASES.find((f) => f.fase === n) ?? null;
export const slotDe = (fase: number, slot: string) => faseDe(fase)?.slots.find((s) => s.slot === slot) ?? null;

/** Archivos pedidos en total en una fase / en un script entero. */
export const totalFase = (f: FaseScript) => f.slots.reduce((s, x) => s + x.n, 0);
export const TOTAL_SCRIPT = FASES.reduce((s, f) => s + totalFase(f), 0);

export type TipoColeccion = "script" | "pack" | "post";
export const ETIQUETA_TIPO: Record<TipoColeccion, string> = { script: "Scripts", pack: "Packs", post: "Posts" };

export type ArchivoOF = {
  id: string;
  coleccion_id: string;
  fase: number | null;
  slot: SlotId | null;
  tipo_archivo: "video" | "foto";
  orden: number;
  nombre_original: string | null;
  mime: string | null;
  size_bytes: number | null;
  duracion_seg: number | null;
  descargado_at: string | null;
  subido_of_at: string | null;
  created_at: string;
};

export type ColeccionOF = {
  id: string;
  modelo_id: string;
  tipo: TipoColeccion;
  nombre: string;
  descripcion: string | null;
  estado: "en_curso" | "entregado";
  entregado_at: string | null;
  subido_of_at: string | null;
  created_at: string;
};

/** Cuantos archivos hay en un hueco de un script. */
export const archivosDeSlot = (archivos: ArchivoOF[], fase: number, slot: string) =>
  archivos.filter((a) => a.fase === fase && a.slot === slot).sort((a, b) => a.orden - b.orden);

/** Fases completas (todos sus huecos llenos) de un script. */
export function progresoScript(archivos: ArchivoOF[]) {
  let fasesCompletas = 0;
  let subidos = 0;
  for (const f of FASES) {
    const llenos = f.slots.every((s) => archivosDeSlot(archivos, f.fase, s.slot).length >= s.n);
    if (llenos) fasesCompletas++;
    subidos += f.slots.reduce((acc, s) => acc + Math.min(s.n, archivosDeSlot(archivos, f.fase, s.slot).length), 0);
  }
  return { fasesCompletas, subidos, total: TOTAL_SCRIPT };
}

export function formatoTamano(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatoDuracion(seg: number | null | undefined) {
  if (!seg && seg !== 0) return "";
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const limpiar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 40) || "x";

/**
 * Nombre con el que se descarga cada archivo: ordenado para clasificarlo de un vistazo.
 *  script: Rachel_Script1_F03_video.mov, Rachel_Script1_F03_foto2.jpg
 *  pack/post: Rachel_Pack_ducha_foto03.jpg, Rachel_Pack_ducha_video01.mp4
 */
export function nombreDescarga(
  modelo: string,
  col: Pick<ColeccionOF, "tipo" | "nombre">,
  a: Pick<ArchivoOF, "fase" | "slot" | "tipo_archivo" | "orden" | "nombre_original">,
) {
  const ext = (a.nombre_original?.split(".").pop() ?? (a.tipo_archivo === "video" ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const base = `${limpiar(modelo)}_${limpiar(col.nombre)}`;
  if (col.tipo === "script" && a.fase) {
    const parte =
      a.tipo_archivo === "video"
        ? "video"
        : a.slot === "foto_relajada"
          ? `foto_relajada${a.orden}`
          : a.slot === "foto_explicita"
            ? `foto_explicita${a.orden}`
            : `foto${a.orden}`;
    return `${base}_F${String(a.fase).padStart(2, "0")}_${parte}.${ext}`;
  }
  return `${base}_${a.tipo_archivo}${String(a.orden).padStart(2, "0")}.${ext}`;
}

export const CLAVE_BASE = "onlyfans";
