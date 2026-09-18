import { NextResponse } from "next/server";
import { decryptVaultValue, encryptVaultValue } from "@/lib/vault/crypto";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (!canUseSupabase()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("vault_panel").select("nombre,encrypted_blob,iv").eq("id", id).single();
  if (data?.nombre?.startsWith("portal:")) return NextResponse.json({ error: "Entrada interna" }, { status: 403 });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  return NextResponse.json({ value: decryptVaultValue(data.encrypted_blob, data.iv) });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const value = String(formData.get("value") ?? "");
  const nombre = String(formData.get("nombre") ?? "");
  const categoria = String(formData.get("categoria") ?? "otro");
  const descripcion = String(formData.get("descripcion") ?? "");
  const modeloId = String(formData.get("modelo_id") ?? "") || null;

  if (!value || !nombre) return NextResponse.json({ error: "nombre and value are required" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const encrypted = encryptVaultValue(value);
  const supabase = createAdminClient();
  const { error } = await supabase.from("vault_panel").insert({
    nombre,
    categoria,
    descripcion,
    modelo_id: modeloId,
    encrypted_blob: encrypted.encrypted_blob,
    iv: encrypted.iv,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const supabase = createAdminClient();
  const { error } = await supabase.from("vault_panel").delete().eq("id", id).not("nombre", "like", "portal:%");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Edita nombre, categoria, descripcion, modelo y (si se envia) el valor cifrado
export async function PUT(request: Request) {
  const formData = await request.formData();
  const id = String(formData.get("id") ?? "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

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
  if (value) Object.assign(fila, encryptVaultValue(value));

  const { error } = await createAdminClient().from("vault_panel").update(fila).eq("id", id).not("nombre", "like", "portal:%");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
