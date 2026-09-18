import { NextRequest, NextResponse } from 'next/server';
import { canUseSupabase, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// tipo_video en BD es texto ('tipo1'..'tipo4'); el runner trabaja con el numero 1-4.
function tipoVideoANumero(tipoVideo: string | null): number {
  if (!tipoVideo) return 4;
  const s = tipoVideo.toLowerCase();
  if (s.includes('1')) return 1;
  if (s.includes('2')) return 2;
  if (s.includes('3')) return 3;
  return 4;
}

export async function POST(req: NextRequest) {
  if (!canUseSupabase()) {
    return NextResponse.json({ ok: false, error: 'Supabase no configurado' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] | undefined = body.ids;
  const supabase = createAdminClient();

  let query = supabase
    .from('library_content')
    .select('id, tipo_video')
    .eq('estado', 'en_reparto')
    .not('tipo_video', 'is', null)
    .neq('tipo_video', 'sin_clasificar');

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
    const { error } = await supabase
      .from('library_content')
      .update({
        estado: 'editando',
        estado_procesamiento: 'pendiente',
        error_mensaje: null,
        tipo: tipoVideoANumero(pieza.tipo_video as string | null),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pieza.id);

    if (!error) confirmados++;
  }

  return NextResponse.json({ ok: true, confirmados });
}
