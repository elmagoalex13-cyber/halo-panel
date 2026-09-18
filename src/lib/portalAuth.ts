import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { decryptVaultValue, encryptVaultValue } from "@/lib/vault/crypto";

// Credenciales del portal de modelos: fila en vault_panel (nombre "portal:<modelo_id>")
// con {usuario, salt, hash} cifrado. Sesion: cookie httpOnly firmada con HMAC.

export const COOKIE_PORTAL = "halo_portal";
const SESION_HORAS = 24 * 30;

function secreto() {
  const v = process.env.VAULT_MASTER_KEY;
  if (!v || v.length < 32) throw new Error("VAULT_MASTER_KEY no configurada");
  return v;
}

export function slugify(texto: string) {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "modelo"
  );
}

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function generarPassword() {
  const alfabeto = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

type Credencial = { usuario: string; salt: string; hash: string };

export async function leerCredencial(modeloId: string): Promise<Credencial | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("vault_panel")
    .select("encrypted_blob, iv")
    .eq("nombre", `portal:${modeloId}`)
    .maybeSingle();
  if (!data) return null;
  try {
    return JSON.parse(decryptVaultValue(data.encrypted_blob, data.iv)) as Credencial;
  } catch {
    return null;
  }
}

export async function guardarCredencial(modeloId: string, usuario: string, password: string) {
  const supabase = createAdminClient();
  const salt = crypto.randomBytes(16).toString("hex");
  const cifrado = encryptVaultValue(JSON.stringify({ usuario, salt, hash: hashPassword(password, salt) }));
  const nombre = `portal:${modeloId}`;
  const { data: existente } = await supabase.from("vault_panel").select("id").eq("nombre", nombre).maybeSingle();
  const fila = { nombre, categoria: "otro", descripcion: "Acceso portal modelo", modelo_id: modeloId, ...cifrado };
  const { error } = existente
    ? await supabase.from("vault_panel").update(fila).eq("id", existente.id)
    : await supabase.from("vault_panel").insert(fila);
  if (error) throw error;
}

export async function verificarLogin(slug: string, usuario: string, password: string) {
  const supabase = createAdminClient();
  const { data: modelo } = await supabase
    .from("modelos")
    .select("id, nombre, activa, portal_token")
    .eq("portal_token", slug)
    .maybeSingle();
  if (!modelo || !modelo.activa) return null;
  const cred = await leerCredencial(modelo.id);
  if (!cred || cred.usuario.toLowerCase() !== usuario.trim().toLowerCase()) return null;
  const candidato = Buffer.from(hashPassword(password, cred.salt), "hex");
  const real = Buffer.from(cred.hash, "hex");
  if (candidato.length !== real.length || !crypto.timingSafeEqual(candidato, real)) return null;
  return { id: modelo.id as string, nombre: modelo.nombre as string };
}

function firmar(payload: string) {
  return crypto.createHmac("sha256", secreto()).update(payload).digest("base64url");
}

export function crearSesion(modeloId: string, slug: string) {
  const exp = Date.now() + SESION_HORAS * 3600000;
  const payload = Buffer.from(JSON.stringify({ m: modeloId, s: slug, e: exp })).toString("base64url");
  return { valor: `${payload}.${firmar(payload)}`, maxAge: SESION_HORAS * 3600 };
}

export type SesionPortal = { modeloId: string; slug: string };

export function leerSesion(valor: string | undefined): SesionPortal | null {
  if (!valor) return null;
  const [payload, firma] = valor.split(".");
  if (!payload || !firma) return null;
  const esperada = firmar(payload);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { m: string; s: string; e: number };
    if (d.e < Date.now()) return null;
    return { modeloId: d.m, slug: d.s };
  } catch {
    return null;
  }
}

/** Sesion valida del portal (opcionalmente para un slug concreto). */
export async function sesionActual(slug?: string): Promise<SesionPortal | null> {
  const jar = await cookies();
  const s = leerSesion(jar.get(COOKIE_PORTAL)?.value);
  if (!s) return null;
  if (slug && s.slug !== slug) return null;
  return s;
}
