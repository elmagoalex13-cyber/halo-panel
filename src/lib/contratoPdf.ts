import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { CONTRATO_AGENCIA, CONTRATO_CLAUSULAS, CONTRATO_TITULO } from "@/lib/contratoTexto";

// PDF del contrato: el texto tal cual, con el nombre de la modelo y la fecha rellenados, la firma de la agencia y, si ya firmo, la suya.

export type DatosPdfContrato = {
  nombre: string;
  fechaInicio: string; // YYYY-MM-DD
  firmaAgencia?: string | null; // PNG como data URL
  firmaCreadora?: string | null;
  nombreFirmante?: string | null;
  dni?: string | null;
  firmadoAt?: string | null; // ISO
  firmanteIp?: string | null;
};

const MARGEN = 56;
const A4 = { w: 595.28, h: 841.89 };

// Helvetica estandar solo admite Latin-1 + algunos signos de Windows-1252: se quita lo demas (emojis...) para que no falle
const limpiar = (t: string) => t.replace(/[^ -~ -ÿ–—‘’“”•€…]/g, "").replace(/\s+/g, " ").trim();

export const fechaLarga = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
};

function partir(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const palabras = limpiar(texto).split(" ");
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) actual = prueba;
    else {
      if (actual) lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export async function generarPdfContrato(d: DatosPdfContrato): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${CONTRATO_TITULO} - ${limpiar(d.nombre)}`);
  pdf.setAuthor(CONTRATO_AGENCIA);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ancho = A4.w - MARGEN * 2;

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - MARGEN;
  const nuevaPagina = () => {
    page = pdf.addPage([A4.w, A4.h]);
    y = A4.h - MARGEN;
  };
  const asegurar = (alto: number) => {
    if (y - alto < MARGEN + 20) nuevaPagina();
  };
  const linea = (texto: string, o: { fuente?: PDFFont; tam?: number; x?: number; ancho?: number; espacio?: number; color?: [number, number, number] } = {}) => {
    const fuente = o.fuente ?? normal;
    const tam = o.tam ?? 10;
    for (const l of partir(texto, fuente, tam, o.ancho ?? ancho)) {
      asegurar(tam + 3);
      page.drawText(l, { x: o.x ?? MARGEN, y: y - tam, size: tam, font: fuente, color: rgb(...(o.color ?? [0.08, 0.08, 0.1])) });
      y -= tam + 3.2;
    }
    y -= o.espacio ?? 0;
  };

  // Cabecera
  linea(CONTRATO_TITULO, { fuente: negrita, tam: 14, espacio: 8 });
  linea("Entre:", { espacio: 2 });
  linea(`${CONTRATO_AGENCIA} (en adelante, "la Agencia")`, { fuente: negrita, espacio: 2 });
  linea("y", { espacio: 2 });
  linea(`${d.nombre} (en adelante, "la Creadora")`, { fuente: negrita, espacio: 2 });
  linea(`Con fecha de inicio: ${fechaLarga(d.fechaInicio)}`, { espacio: 10 });

  // Clausulas (texto tal cual)
  for (const c of CONTRATO_CLAUSULAS) {
    asegurar(40);
    y -= 4;
    linea(`${c.n}. ${c.titulo}`, { fuente: negrita, tam: 11, espacio: 3 });
    for (const b of c.bloques) {
      if (b.tipo === "li") {
        asegurar(14);
        page.drawText("•", { x: MARGEN + 6, y: y - 10, size: 10, font: normal, color: rgb(0.08, 0.08, 0.1) });
        linea(b.texto, { x: MARGEN + 20, ancho: ancho - 20, espacio: 1 });
      } else if (b.negrita) {
        // "Cuentas de monetizacion (...):" en negrita y el resto debajo
        linea(b.negrita, { fuente: negrita, espacio: 0 });
        linea(b.texto, { espacio: 4 });
      } else {
        linea(b.texto, { espacio: 4 });
      }
    }
  }

  // Firmas
  asegurar(210);
  y -= 8;
  linea("FIRMAS", { fuente: negrita, tam: 12, espacio: 4 });
  linea("Leído y aceptado en su totalidad, las partes firman el presente contrato en prueba de conformidad.", { espacio: 10 });

  const colX = [MARGEN, MARGEN + ancho / 2 + 10];
  const topY = y;
  const dibujarFirma = async (dataUrl: string | null | undefined, x: number) => {
    if (!dataUrl?.startsWith("data:image/png;base64,")) return;
    try {
      const img = await pdf.embedPng(Buffer.from(dataUrl.split(",")[1], "base64"));
      const escala = Math.min(170 / img.width, 50 / img.height); // la firma cabe entre los datos (arriba) y la linea (abajo)
      page.drawImage(img, { x, y: topY - 94, width: img.width * escala, height: img.height * escala });
    } catch {
      /* una firma ilegible no impide generar el documento */
    }
  };
  page.drawText("La Agencia", { x: colX[0], y: topY - 10, size: 10, font: negrita });
  page.drawText(limpiar(CONTRATO_AGENCIA), { x: colX[0], y: topY - 24, size: 9, font: normal });
  page.drawText("La Creadora", { x: colX[1], y: topY - 10, size: 10, font: negrita });
  page.drawText(`Nombre completo: ${limpiar(d.nombreFirmante || d.nombre)}`, { x: colX[1], y: topY - 24, size: 9, font: normal });
  page.drawText(`DNI/NIE: ${limpiar(d.dni || "______________________")}`, { x: colX[1], y: topY - 37, size: 9, font: normal });
  await dibujarFirma(d.firmaAgencia, colX[0]);
  await dibujarFirma(d.firmaCreadora, colX[1]);
  for (const x of colX) {
    page.drawLine({ start: { x, y: topY - 98 }, end: { x: x + 190, y: topY - 98 }, thickness: 0.6, color: rgb(0.5, 0.5, 0.55) });
    page.drawText("Firma", { x, y: topY - 110, size: 8, font: normal, color: rgb(0.5, 0.5, 0.55) });
  }
  y = topY - 126;
  if (d.firmadoAt) {
    const cuando = new Date(d.firmadoAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "long", timeStyle: "short" });
    linea(`Firmado electrónicamente por la Creadora el ${cuando}${d.firmanteIp ? ` (IP ${d.firmanteIp})` : ""}.`, { tam: 8, color: [0.4, 0.4, 0.45] });
  }

  // Numeracion
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => p.drawText(`${i + 1} / ${paginas.length}`, { x: A4.w / 2 - 10, y: 24, size: 8, font: normal, color: rgb(0.5, 0.5, 0.55) }));
  return pdf.save();
}
