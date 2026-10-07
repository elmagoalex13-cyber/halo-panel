"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Trash2, UserPlus } from "lucide-react";
import { AREAS, type AreaId } from "@/lib/areas";

type Usuario = {
  id: string;
  username: string;
  nombre: string | null;
  activo: boolean;
  areas_denegadas: AreaId[];
  ultimo_acceso_at: string | null;
  created_at: string;
};

type Credenciales = { usuario: string; password: string; nuevo: boolean };

// Usuarios adicionales del panel (socios, ayudantes): solo lo ve el dueño. Cada uno puede tener secciones ocultas.
export function UsuariosPanel() {
  const [dueno, setDueno] = useState<boolean | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState<{ nombre: string; username: string; denegadas: AreaId[] }>({ nombre: "", username: "", denegadas: ["leads"] });
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/panel/usuarios", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { usuarios?: Usuario[]; error?: string };
    if (!res.ok) return setError(j.error ?? "No se pudo cargar");
    setError(null);
    setUsuarios(j.usuarios ?? []);
  }, []);

  useEffect(() => {
    fetch("/api/panel/yo")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { dueno?: boolean } | null) => {
        setDueno(Boolean(j?.dueno));
        if (j?.dueno) void cargar();
      })
      .catch(() => setDueno(false));
  }, [cargar]);

  if (!dueno) return null;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/panel/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username, nombre: form.nombre, areas_denegadas: form.denegadas }),
      });
      const j = (await res.json().catch(() => ({}))) as { usuario?: Usuario; password?: string; error?: string };
      if (!res.ok || !j.usuario || !j.password) throw new Error(j.error ?? "No se pudo crear");
      setCredenciales({ usuario: j.usuario.username, password: j.password, nuevo: true });
      setForm({ nombre: "", username: "", denegadas: ["leads"] });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setCreando(false);
    }
  }

  async function cambiar(u: Usuario, cambios: Partial<{ activo: boolean; areas_denegadas: AreaId[]; nueva_password: boolean }>) {
    setError(null);
    const res = await fetch("/api/panel/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, ...cambios }) });
    const j = (await res.json().catch(() => ({}))) as { password?: string; error?: string };
    if (!res.ok) return setError(j.error ?? "No se pudo guardar");
    if (j.password) setCredenciales({ usuario: u.username, password: j.password, nuevo: false });
    await cargar();
  }

  async function borrar(u: Usuario) {
    if (!window.confirm(`¿Eliminar a ${u.nombre || u.username}? Perderá el acceso al instante.`)) return;
    const res = await fetch(`/api/panel/usuarios?id=${u.id}`, { method: "DELETE" });
    if (res.ok) await cargar();
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo eliminar");
  }

  const alternarArea = (lista: AreaId[], a: AreaId) => (lista.includes(a) ? lista.filter((x) => x !== a) : [...lista, a]);
  const enlace = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";

  async function copiar() {
    if (!credenciales) return;
    try {
      await navigator.clipboard.writeText(`Panel HALO\nEnlace: ${enlace}\nUsuario: ${credenciales.usuario}\nContraseña: ${credenciales.password}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles: se puede copiar a mano */
    }
  }

  return (
    <section className="glass-card space-y-4 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">Usuarios del panel</h2>
        <p className="mt-1 text-sm text-white/45">
          Da acceso a otra persona (un socio, un ayudante) con su propio usuario y contraseña. Tú eliges qué secciones no puede ver. Tu acceso no cambia.
        </p>
      </div>

      {credenciales ? (
        <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-300">{credenciales.nuevo ? "Usuario creado" : "Contraseña nueva"}: guarda estos datos ahora, la contraseña no se vuelve a mostrar</p>
          <div className="space-y-1 font-mono text-sm text-white">
            <p>Enlace: {enlace}</p>
            <p>Usuario: {credenciales.usuario}</p>
            <p>Contraseña: {credenciales.password}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copiar} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <Copy className="h-3.5 w-3.5" /> {copiado ? "Copiado" : "Copiar los datos"}
            </button>
            <button onClick={() => setCredenciales(null)} className="btn-secondary px-3 py-1.5 text-xs">Cerrar</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      <ul className="space-y-3">
        {usuarios.map((u) => (
          <li key={u.id} className={`space-y-3 rounded-xl border p-4 ${u.activo ? "border-white/10 bg-white/[0.03]" : "border-white/5 bg-white/[0.01] opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{u.nombre || u.username}</p>
                <p className="text-xs text-white/40">
                  {u.username} · {u.ultimo_acceso_at ? `último acceso ${new Date(u.ultimo_acceso_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "aún no ha entrado"}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${u.activo ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                {u.activo ? "Tiene acceso" : "Sin acceso"}
              </span>
              <button
                onClick={() => {
                  if (u.activo && !window.confirm(`¿Quitar el acceso a ${u.nombre || u.username} ahora mismo? Se le cierra la sesión en segundos y no podrá volver a entrar hasta que se lo devuelvas. No pierde ni se borra nada.`)) return;
                  void cambiar(u, { activo: !u.activo });
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${u.activo ? "border-red-500/50 bg-red-500/15 text-red-200 hover:bg-red-500/25" : "border-emerald-500/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"}`}
              >
                {u.activo ? "Quitar acceso" : "Devolver acceso"}
              </button>
              <button onClick={() => cambiar(u, { nueva_password: true })} title="Genera una contraseña nueva" className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs">
                <KeyRound className="h-3.5 w-3.5" /> Nueva contraseña
              </button>
              <button onClick={() => borrar(u)} title="Eliminar" className="rounded-lg border border-red-900/50 bg-red-950/40 p-2 text-red-300 hover:bg-red-950/70">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">No puede ver (marca para ocultar)</p>
              <div className="flex flex-wrap gap-2">
                {AREAS.map((a) => {
                  const oculto = u.areas_denegadas.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => cambiar(u, { areas_denegadas: alternarArea(u.areas_denegadas, a.id) })}
                      title={a.descripcion}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${oculto ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"}`}
                    >
                      {oculto ? "✕ " : ""}
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
        {!usuarios.length && !error ? <li className="text-sm text-white/35">Todavía no has creado ningún usuario.</li> : null}
      </ul>

      <form onSubmit={crear} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <UserPlus className="h-4 w-4" /> Nuevo usuario
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre (ej. Marcos, socio)" className="input-base" />
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Usuario para entrar (ej. marcos)" className="input-base" autoCapitalize="none" required />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">Secciones que NO podrá ver</p>
          <div className="flex flex-wrap gap-2">
            {AREAS.map((a) => {
              const oculto = form.denegadas.includes(a.id);
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setForm({ ...form, denegadas: alternarArea(form.denegadas, a.id) })}
                  title={a.descripcion}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${oculto ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"}`}
                >
                  {oculto ? "✕ " : ""}
                  {a.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-white/30">El resto del panel (modelos, aprobación, Instagram, originales…) sí lo verá. Puedes cambiarlo cuando quieras.</p>
        </div>
        <button type="submit" disabled={creando || form.username.trim().length < 3} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
          {creando ? "Creando…" : "Crear usuario"}
        </button>
      </form>
    </section>
  );
}
