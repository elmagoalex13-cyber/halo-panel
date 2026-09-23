export const ADMIN_COOKIE = "halo_admin";
export const ADMIN_SESSION_DAYS = 7;

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlString(value: string) {
  return base64Url(encoder.encode(value));
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(base64);
}

async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64Url(new Uint8Array(signature));
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.VAULT_MASTER_KEY || "";
}

export function adminAuthConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && sessionSecret());
}

export async function crearAdminSesion(username: string) {
  const exp = Date.now() + ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = base64UrlString(JSON.stringify({ u: username, exp }));
  const sig = await hmac(payload, sessionSecret());
  return `${payload}.${sig}`;
}

export async function verificarAdminSesion(cookie: string | undefined | null) {
  if (!cookie || !adminAuthConfigured()) return false;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return false;
  const esperado = await hmac(payload, sessionSecret());
  if (sig !== esperado) return false;
  try {
    const data = JSON.parse(fromBase64Url(payload)) as { u?: string; exp?: number };
    return data.u === process.env.ADMIN_USERNAME && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

export function verificarCredenciales(username: string, password: string) {
  return adminAuthConfigured() && username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD;
}
