import { NextRequest, NextResponse } from "next/server";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { programarPieza } from "@/lib/publer";
import { aplicarAjusteRecorte, parseNotaRecorte } from "@/lib/notaRecorte";
import type { VideoEstado } from "@/types";
import { exigirFila } from "@/lib/alcance";
import { existeEnR2 } from "@/lib/r2";
import { OPCIONES_VELOCIDAD, leerVelocidad, ponerAjustes } from "@/lib/velocidadHablados";

const ESTADO_MAP: Record<string, string> = {
  aprobar: "aprobado",
  rehacer: "editando",
  nueva_frase: "editando",
  recorte: "editando",
  ajustes: "editando",
  descartar: "rechazado",
};

export async function PATCH(req: NextRequest) {
  try {
    const { id, accion, caption, correcciones, frase_quemada, recorte_inicio, recorte_fin, velocidad, recorte_cambiado, musica } = (await req.json()) as {
      id?: string;
      accion?: string;
      caption?: string;
      correcciones?: string;
      frase_quemada?: string;
      recorte_inicio?: number | null;
      recorte_fin?: number | null;
      velocidad?: number;
      recorte_cambiado?: boolean;
      musica?: string;
    };

    if (!id || !accion || !ESTADO_MAP[accion]) {
      return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
    }

    const nuevoEstado = ESTADO_MAP[accion] as VideoEstado;

    if (!canUseSupabase()) {
      return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
    }

    { const g = await exigirFila("library_content", id); if (g) return g; }
    const supabase = createAdminClient();
    const { data: actual, error: actualError } = await supabase
      .from("library_content")
      .select("id, estado, recorte_inicio, recorte_fin, notas_editor, frase_quemada, tipo_video")
      .eq("id", id)
      .maybeSingle();
    if (actualError) throw actualError;
    if (!actual) return NextResponse.json({ error: "Video no encontrado" }, { status: 404 });
    // Rehacer (y sus variantes: nueva frase, recorte, velocidad/volumen) tambien vale para un video ya aprobado; aprobar/descartar solo para los que esperan
    const REHACER = ["rehacer", "nueva_frase", "recorte", "ajustes"];
    const permitidos = REHACER.includes(accion) ? ["en_aprobacion", "aprobado"] : ["en_aprobacion"];
    if (!permitidos.includes(actual.estado as string)) {
      return NextResponse.json({ ok: true, estado: actual.estado, skipped: true });
    }

    // recorte_inicio/fin guarda siempre el recorte USADO (para enseñarlo en la mesa), sea automatico o manual.
    // Esta marca en notas_editor dice que lo puso una persona: solo entonces el runner lo reutiliza al rehacer
    // (si no, se volveria a aplicar para siempre el recorte automatico de la primera vez, aunque fuera malo).
    const MARCA_MANUAL = "[recorte-manual]";
    const conMarcaManual = (notas: string | null) => (notas?.includes(MARCA_MANUAL) ? notas : [notas, MARCA_MANUAL].filter(Boolean).join("\n"));

    const update: Record<string, unknown> = {
      estado: nuevoEstado,
      updated_at: new Date().toISOString(),
    };

    if (caption !== undefined) update.caption = caption;
    if (correcciones !== undefined) update.correcciones = correcciones;
    if (frase_quemada !== undefined) update.frase_quemada = frase_quemada;
    if (accion === "aprobar") {
      update.aprobado_at = new Date().toISOString();
      update.estado_procesamiento = "aprobado";
      update.error_mensaje = null;
    }
    if (accion === "descartar") {
      update.estado_procesamiento = "descartado";
      update.error_mensaje = null;
    }
    if (accion === "rehacer") {
      // El runner vuelve a coger la pieza: reset del estado de procesamiento
      update.estado_procesamiento = "pendiente";
      update.error_mensaje = null;
      update.aprobado_at = null;
      update.publicado_at = null;

      // Sin IA de por medio, la nota de "rehacer" solo se puede interpretar de
      // forma fiable si trae una instruccion explicita de recorte tipo
      // "inicio +1.5" / "fin -0.5" (ver notaRecorte.ts): ajusta el recorte
      // actual (el que de verdad se uso la ultima vez, automatico o manual)
      // en vez de ignorar la nota en silencio. Texto libre sin ese formato no
      // se interpreta (adivinar mal seria peor que no hacer nada).
      // Todo lo que se haya cambiado en la ventana (velocidad, recorte, frase, notas) se aplica EN LA MISMA vez: un solo rehacer
      let notas = actual.notas_editor as string | null;
      let recorteBase = { inicio: actual.recorte_inicio as number | null, fin: actual.recorte_fin as number | null };
      if (typeof velocidad === "number") {
        if (!(OPCIONES_VELOCIDAD as readonly number[]).includes(velocidad)) return NextResponse.json({ error: "Velocidad no valida" }, { status: 400 });
        notas = ponerAjustes(notas, { velocidad, volumen: 1 });
        update.notas_editor = notas;
      }
      if (recorte_cambiado) {
        recorteBase = { inicio: typeof recorte_inicio === "number" ? recorte_inicio : null, fin: typeof recorte_fin === "number" ? recorte_fin : null };
        update.recorte_inicio = recorteBase.inicio;
        update.recorte_fin = recorteBase.fin;
        notas = conMarcaManual(notas);
        update.notas_editor = notas;
      }
      const ajuste = correcciones ? parseNotaRecorte(correcciones) : null;
      if (ajuste) {
        const { inicio, fin } = aplicarAjusteRecorte(ajuste, recorteBase);
        update.recorte_inicio = inicio;
        update.recorte_fin = fin;
        update.notas_editor = conMarcaManual(notas);
      }
      // Frase con musica: si se ha cambiado el texto de la frase, la colocacion guardada (que manda sobre el texto) se descarta para que se use el nuevo
      if (frase_quemada !== undefined && actual.tipo_video === "tipo2" && frase_quemada !== (actual.frase_quemada ?? "")) update.layout_json = null;
    }
    if (accion === "nueva_frase") {
      // Igual que rehacer, pero ademas se borra la frase/layout actuales para que el
      // runner asigne una frase distinta del banco (asignarFrase excluye las ya usadas
      // en esta pieza) en vez de repetir el mismo caption.
      update.estado_procesamiento = "pendiente";
      update.error_mensaje = null;
      update.aprobado_at = null;
      update.publicado_at = null;
      update.frase_quemada = null;
      update.layout_json = null;
      update.audio_referencia_url = null; // la musica era la de la frase anterior: la nueva trae la suya
      // Tambien aplica a la vez lo demas que se haya cambiado (velocidad, recorte)
      let notas = actual.notas_editor as string | null;
      if (typeof velocidad === "number" && (OPCIONES_VELOCIDAD as readonly number[]).includes(velocidad)) {
        notas = ponerAjustes(notas, { velocidad, volumen: 1 });
        update.notas_editor = notas;
      }
      if (recorte_cambiado) {
        update.recorte_inicio = typeof recorte_inicio === "number" ? recorte_inicio : null;
        update.recorte_fin = typeof recorte_fin === "number" ? recorte_fin : null;
        update.notas_editor = conMarcaManual(notas);
      }
    }
    // Musica del video de gesto: «auto» = la de su frase; «none» = el audio de la modelo; un id de frase = la musica de ESA frase (para frases sin musica)
    if ((accion === "rehacer" || accion === "nueva_frase") && typeof musica === "string" && musica) {
      const sinMarca = ((update.notas_editor as string | null | undefined) ?? (actual.notas_editor as string | null) ?? "").replace(/\[sin-musica\]/g, "").trim();
      if (musica === "none") {
        update.audio_referencia_url = null;
        update.notas_editor = [sinMarca, "[sin-musica]"].filter(Boolean).join("\n");
      } else if (musica === "auto") {
        update.audio_referencia_url = null;
        update.notas_editor = sinMarca || null;
      } else if (/^[0-9a-f-]{36}$/i.test(musica)) {
        const clave = `frases-audio/${musica}.m4a`;
        if (!(await existeEnR2(clave))) return NextResponse.json({ error: "Esa frase no tiene música" }, { status: 400 });
        update.audio_referencia_url = clave;
        update.notas_editor = sinMarca || null;
      }
    }
    if (accion === "ajustes") {
      // Velocidad (1.1x, 1.2x...) y volumen del video hablado: se guardan en las notas y se reencola para que el editor lo rehaga con ellos
      const vel = velocidad ?? leerVelocidad(actual.notas_editor);
      if (!(OPCIONES_VELOCIDAD as readonly number[]).includes(vel)) {
        return NextResponse.json({ error: "Velocidad no valida" }, { status: 400 });
      }
      update.estado_procesamiento = "pendiente";
      update.error_mensaje = null;
      update.aprobado_at = null;
      update.publicado_at = null;
      update.notas_editor = ponerAjustes(actual.notas_editor, { velocidad: vel, volumen: 1 });
    }
    if (accion === "recorte") {
      // Guarda el recorte manual (segundos sobre el video bruto, marcados en
      // la mesa viendo el original) y reencola: el runner lo usa en vez de la
      // deteccion automatica de inicio/fin de voz.
      if (typeof recorte_inicio !== "number" && typeof recorte_fin !== "number") {
        return NextResponse.json({ error: "Falta recorte_inicio o recorte_fin" }, { status: 400 });
      }
      update.estado_procesamiento = "pendiente";
      update.error_mensaje = null;
      update.aprobado_at = null;
      update.publicado_at = null;
      update.recorte_inicio = typeof recorte_inicio === "number" ? recorte_inicio : null;
      update.recorte_fin = typeof recorte_fin === "number" ? recorte_fin : null;
      update.notas_editor = conMarcaManual(actual.notas_editor);
    }

    const { data: updated, error } = await supabase
      .from("library_content")
      .update(update)
      .eq("id", id)
      .eq("estado", actual.estado as string)
      .select("id");
    if (error) throw error;
    if (!updated?.length) return NextResponse.json({ ok: true, estado: actual.estado, skipped: true });

    await supabase
      .from("log_agentes")
      .insert({
        agente: "runner_edicion",
        accion: `mesa_${accion}`,
        resultado: "ok",
        detalle: { content_id: id },
      })
      .then(() => undefined, () => undefined);

    // Aprobado => el agente lo programa en Publer segun las reglas de horario
    const programacion = accion === "aprobar" ? await programarPieza(supabase, id) : undefined;
    return NextResponse.json({ ok: true, estado: nuevoEstado, programacion });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 });
  }
}
