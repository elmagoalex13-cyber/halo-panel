import { NextResponse } from "next/server";
import { decryptVaultValue, encryptVaultValue } from "@/lib/vault/crypto";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { sesionPanelActual } from "@/lib/panelUsuarios";

// Vault con dos ambitos: "privado" (solo el dueño) y "compartido" (el dueño y los usuarios con acceso al Vault).
// Las reglas se aplican AQUI, en el servidor: un usuario que no es el dueño nunca puede leer, cambiar ni borrar
// una entrada privada, aunque conozca su id. Si la columna `ambito` aun no existe (falta el SQL 20261011), a los
// usuarios que no son el dueño no se les devuelve nada.
type Ambito = "privado" | "compartido";
const ambitoValido = (v: unknown): Ambito => (v === "compartido" ? "compartido" : "privado");

const prohibido = () => NextResponse.json({ error: "No tienes acceso a esta entrada" }, { status: 403 });
const sinSesion = () => NextResponse.json({ error: "No autorizado" }, { status: 401 });
const sinSupabase = () => NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

/** Ambito de una entrada (null si no existe o la columna falta). */
async function ambitoDe(id: string): Promise<{ existe: boolean; ambito: Ambito | null; nombre?: string; eliminada?: boolean }> {
  const db = createAdminClient();
  let r = await db.from("vault_panel").select("nombre, ambito, eliminada_at").eq("id", id).maybeSingle();
  if (r.error) r = (await db.from("vault_panel").select("nombre, ambito").eq("id", id).maybeSingle()) as typeof r;
  const { data, error } = r;
  if (error || !data) return { existe: Boolean(data), ambito: null };
  return { existe: true, ambito: ambitoValido(data.ambito), nombre: data.nombre, eliminada: Boolean((data as { eliminada_at?: string | null }).eliminada_at) };
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!canUseSupabase()) return sinSupabase();
  const sesion = await sesionPanelActual();
  if (!sesion) return sinSesion();

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("vault_panel").select("nombre,encrypted_blob,iv,ambito,eliminada_at").eq("id", id).maybeSingle();
  if (error && /ambito|eliminada_at/i.test(error.message)) {
    // Sin la columna: el dueño lo ve todo como siempre; los demas, nada
    if (!sesion.dueno) return prohibido();
    const { data: antiguo } = await supabase.from("vault_panel").select("nombre,encrypted_blob,iv").eq("id", id).single();
    if (!antiguo || antiguo.nombre?.startsWith("portal:")) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ value: decryptVaultValue(antiguo.encrypted_blob, antiguo.iv) });
  }
  if (!data) return NextResponse.json({ error: error?.message ?? "No encontrada" }, { status: 404 });
  if (data.nombre?.startsWith("portal:")) return NextResponse.json({ error: "Entrada interna" }, { status: 403 });
  if (!sesion.dueno && (data.ambito !== "compartido" || data.eliminada_at)) return prohibido();

  return NextResponse.json({ value: decryptVaultValue(data.encrypted_blob, data.iv) });
}

export async function POST(request: Request) {
  if (!canUseSupabase()) return sinSupabase();
  const sesion = await sesionPanelActual();
  if (!sesion) return sinSesion();

  const formData = await request.formData();
  const value = String(formData.get("value") ?? "");
  const nombre = String(formData.get("nombre") ?? "");
  const categoria = String(formData.get("categoria") ?? "otro");
  const descripcion = String(formData.get("descripcion") ?? "");
  const modeloId = String(formData.get("modelo_id") ?? "") || null;
  // Solo el dueño elige el ambito; lo que crea otro usuario es siempre compartido
  const ambito: Ambito = sesion.dueno ? ambitoValido(formData.get("ambito")) : "compartido";

  if (!value || !nombre) return NextResponse.json({ error: "nombre and value are required" }, { status: 400 });

  const encrypted = encryptVaultValue(value);
  const fila = { nombre, categoria, descripcion, modelo_id: modeloId, encrypted_blob: encrypted.encrypted_blob, iv: encrypted.iv };
  const supabase = createAdminClient();
  let { error } = await supabase.from("vault_panel").insert({ ...fila, ambito });
  if (error && /ambito/i.test(error.message)) {
    // Falta el SQL 20261011: solo el dueño puede seguir guardando (como antes); nadie mas hasta que se ejecute
    if (!sesion.dueno || ambito === "compartido") return NextResponse.json({ error: "Falta ejecutar el SQL 20261011_vault_ambito.sql en Supabase para usar el baúl compartido." }, { status: 409 });
    ({ error } = await supabase.from("vault_panel").insert(fila));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!canUseSupabase()) return sinSupabase();
  const sesion = await sesionPanelActual();
  if (!sesion) return sinSesion();

  // Borrado DEFINITIVO desde la papelera: solo el dueño, solo si ya esta en la papelera y con el nombre exacto (2.ª confirmacion)
  const url = new URL(request.url);
  if (url.searchParams.get("definitivo") === "1") {
    if (!sesion.dueno) return prohibido();
    const db = createAdminClient();
    const { data: fila } = await db.from("vault_panel").select("nombre, eliminada_at").eq("id", id).maybeSingle();
    if (!fila || fila.nombre?.startsWith("portal:")) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    if (!fila.eliminada_at) return NextResponse.json({ error: "Solo se puede borrar para siempre lo que ya está en la papelera" }, { status: 409 });
    if ((url.searchParams.get("confirmar") ?? "").trim().toLowerCase() !== String(fila.nombre).trim().toLowerCase()) {
      return NextResponse.json({ error: "El nombre escrito no coincide" }, { status: 400 });
    }
    const { error: errBorrar } = await db.from("vault_panel").delete().eq("id", id);
    if (errBorrar) return NextResponse.json({ error: errBorrar.message }, { status: 500 });
    await db.from("papelera_filas").delete().eq("tabla", "vault_panel").eq("fila->>id", id); // tambien las copias y versiones anteriores
    return NextResponse.json({ ok: true });
  }

  if (!sesion.dueno) {
    const a = await ambitoDe(id);
    if (!a.existe || a.eliminada || a.ambito !== "compartido" || a.nombre?.startsWith("portal:")) return prohibido();
  }
  // Va a la PAPELERA (no se borra): el dueño la ve y la puede restaurar
  const { error } = await createAdminClient()
    .from("vault_panel")
    .update({ eliminada_at: new Date().toISOString(), eliminada_por: sesion.usuario })
    .eq("id", id)
    .not("nombre", "like", "portal:%");
  if (error) {
    if (/eliminada/i.test(error.message)) return NextResponse.json({ error: "Falta ejecutar el SQL 20261016_papelera.sql en Supabase." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Restaurar una entrada de la papelera (solo el dueño): PATCH { id }
export async function PATCH(request: Request) {
  if (!canUseSupabase()) return sinSupabase();
  const sesion = await sesionPanelActual();
  if (!sesion) return sinSesion();
  if (!sesion.dueno) return prohibido();
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { error } = await createAdminClient().from("vault_panel").update({ eliminada_at: null, eliminada_por: null }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Edita nombre, categoria, descripcion, modelo, ambito (solo el dueño) y (si se envia) el valor cifrado
export async function PUT(request: Request) {
  if (!canUseSupabase()) return sinSupabase();
  const sesion = await sesionPanelActual();
  if (!sesion) return sinSesion();

  const formData = await request.formData();
  const id = String(formData.get("id") ?? "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (!sesion.dueno) {
    const a = await ambitoDe(id);
    if (!a.existe || a.eliminada || a.ambito !== "compartido" || a.nombre?.startsWith("portal:")) return prohibido();
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  const value = String(formData.get("value") ?? "");
  const fila: Record<string, unknown> = {
    nombre,
    categoria: String(formData.get("categoria") ?? "otro"),
    descripcion: String(formData.get("descripcion") ?? ""),
    modelo_id: String(formData.get("modelo_id") ?? "") || null,
    updated_at: new Date().toISOString(),
  };
  if (sesion.dueno && formData.get("ambito")) fila.ambito = ambitoValido(formData.get("ambito"));
  if (value) Object.assign(fila, encryptVaultValue(value));

  const supabase = createAdminClient();
  let { error } = await supabase.from("vault_panel").update(fila).eq("id", id).not("nombre", "like", "portal:%");
  if (error && /ambito/i.test(error.message) && "ambito" in fila) {
    delete fila.ambito;
    ({ error } = await supabase.from("vault_panel").update(fila).eq("id", id).not("nombre", "like", "portal:%"));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
