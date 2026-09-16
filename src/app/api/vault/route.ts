import { NextResponse } from "next/server";
import { decryptVaultValue, encryptVaultValue } from "@/lib/vault/crypto";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (!canUseSupabase()) {
    return NextResponse.json({ value: "demo-secret-value" });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("vault_panel").select("encrypted_blob,iv").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  return NextResponse.json({ value: decryptVaultValue(data.encrypted_blob, data.iv) });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const value = String(formData.get("value") ?? "");
  const nombre = String(formData.get("nombre") ?? "");
  const categoria = String(formData.get("categoria") ?? "otro");
  const descripcion = String(formData.get("descripcion") ?? "");

  if (!value || !nombre) return NextResponse.json({ error: "nombre and value are required" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ ok: true, demo: true });

  const encrypted = encryptVaultValue(value);
  const supabase = createAdminClient();
  const { error } = await supabase.from("vault_panel").insert({
    nombre,
    categoria,
    descripcion,
    encrypted_blob: encrypted.encrypted_blob,
    iv: encrypted.iv,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!canUseSupabase()) return NextResponse.json({ ok: true, demo: true });

  const supabase = createAdminClient();
  const { error } = await supabase.from("vault_panel").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
