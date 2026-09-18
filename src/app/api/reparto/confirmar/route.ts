import { NextRequest, NextResponse } from 'next/server';
import { canUseSupabase, createAdminClient } from '@/lib/supabase/server';
import { elegirFrase, registrarUsoFrase } from '@/lib/frases';
import { FILTRO_ETIQUETADO, tipoNumero } from '@/lib/tipoVideo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] | undefined = body.ids;
  const supabase = createAdminClient();

  let query = supabase
    .from('library_content')
    .select('id, tipo_video, tipo, cuenta_id, frase_quemada')
    .eq('estado', 'en_reparto')
    .or(FILTRO_ETIQUETADO);

  if (ids?.length) query = query.in('id', ids);

  const { data: piezas, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  if (!piezas || piezas.length === 0) {
    return NextResponse.json({ ok: true, confirmados: 0 });
  }

  let confirmados = 0;
  for (const pieza of piezas) {
    const tipoPieza = tipoNumero(pieza.tipo_video as string | null, pieza.tipo as number | null);
    // Tipo 2 (caption/gesto): la frase sale sola del banco de frases
    const frase = tipoPieza === 2 && !pieza.frase_quemada ? await elegirFrase(supabase) : null;
    const { error } = await supabase
      .from('library_content')
      .update({
        estado: 'editando',
        estado_procesamiento: 'pendiente',
        error_mensaje: null,
        tipo: tipoPieza,
        ...(frase ? { frase_quemada: frase.frase, ...(frase.nota ? { notas_editor: frase.nota } : {}) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pieza.id);

    if (!error) {
      confirmados++;
      if (frase) await registrarUsoFrase(supabase, frase.id, pieza.id as string, (pieza.cuenta_id as string | null) ?? null);
    }
  }

  return NextResponse.json({ ok: true, confirmados });
}
