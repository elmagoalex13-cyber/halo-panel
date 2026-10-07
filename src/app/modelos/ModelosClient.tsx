"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AtSign, Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/Badge";
import { GlassCard } from "@/components/GlassCard";
import { FotoModelo } from "./FotoModelo";
import { PortalAccesoButton } from "./PortalAccesoButton";
import type { CuentaInstagram, MetricoolEstado, Modelo, SocialNetwork } from "@/types";
import { ConfirmacionDoble } from "@/components/ConfirmacionDoble";

const METRICOOL_DOT: Record<MetricoolEstado, string> = {
  conectada: "bg-emerald-400",
  no_conectada: "bg-white/20",
  error: "bg-red-400",
};

const METRICOOL_TITLE: Record<MetricoolEstado, string> = {
  conectada: "Metricool conectado",
  no_conectada: "Metricool no conectado",
  error: "Error de sincronizacion con Metricool",
};

type ModalState = { mode: "create" } | { mode: "edit"; modelo: Modelo } | null;

const emptyForm = { nombre: "", nombre_real: "", email: "", telefono: "", notas: "", porcentaje_comision: 70 };

const SOCIAL_LABEL: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  twitter: "Twitter / X",
  tiktok: "TikTok",
};

const SOCIAL_PREFIX: Record<SocialNetwork, string> = {
  instagram: "@",
  twitter: "@",
  tiktok: "@",
};

const SOCIAL_PLACEHOLDER: Record<SocialNetwork, string> = {
  instagram: "usuario_ig",
  twitter: "usuario_x",
  tiktok: "usuario_tiktok",
};

type CuentaDraft = { red_social: SocialNetwork; username: string };
type CuentaEditState = { cuenta: CuentaInstagram; red_social: SocialNetwork; username: string; error?: string } | null;

function redCuenta(cuenta: CuentaInstagram): SocialNetwork {
  const url = cuenta.url ?? "";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/(twitter\.com|x\.com)/i.test(url)) return "twitter";
  return cuenta.red_social ?? "instagram";
}

export function ModelosClient({
  modelos: initialModelos,
  cuentas: initialCuentas,
  pipelineByModelo,
  onboardingByModelo,
  fotoByModelo,
  esDueno,
  papelera = [],
}: {
  papelera?: Modelo[];
  esDueno: boolean;
  modelos: Modelo[];
  cuentas: CuentaInstagram[];
  pipelineByModelo: Record<string, number>;
  onboardingByModelo: Record<string, "borrador" | "enviado">;
  fotoByModelo: Record<string, number>;
}) {
  const [modelos, setModelos] = useState(initialModelos);
  // Mis modelos (solo del dueño) y compartidas (tambien las ve su socio)
  const [filtroAmbito, setFiltroAmbito] = useState<"todas" | "mias" | "compartidas">("todas");
  const esCompartida = (m: Modelo) => m.ambito === "compartido";
  const visibles = modelos.filter((m) => filtroAmbito === "todas" || (filtroAmbito === "compartidas" ? esCompartida(m) : !esCompartida(m)));
  const [cuentas, setCuentas] = useState(initialCuentas);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState(emptyForm);
  const [ambitoNueva, setAmbitoNueva] = useState<"compartido" | "privado">("compartido");
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [borrarDef, setBorrarDef] = useState<Modelo | null>(null);
  const [borrandoDef, setBorrandoDef] = useState(false);
  const [errorDef, setErrorDef] = useState<string | null>(null);
  const [cuentaDrafts, setCuentaDrafts] = useState<Record<string, CuentaDraft>>({});
  const [cuentaErrors, setCuentaErrors] = useState<Record<string, string>>({});
  const [cuentaEdit, setCuentaEdit] = useState<CuentaEditState>(null);
  const [cuentaSaving, setCuentaSaving] = useState(false);
  const [metricoolModal, setMetricoolModal] = useState<CuentaInstagram | null>(null);
  const [metricoolBlogId, setMetricoolBlogId] = useState("");
  const [metricoolSaving, setMetricoolSaving] = useState(false);
  const [copiedPortalId, setCopiedPortalId] = useState<string | null>(null);

  const cuentasPorModelo = useMemo(() => {
    const map: Record<string, CuentaInstagram[]> = {};
    cuentas.forEach((cuenta) => {
      if (!map[cuenta.modelo_id]) map[cuenta.modelo_id] = [];
      map[cuenta.modelo_id].push(cuenta);
    });
    return map;
  }, [cuentas]);

  function openCreate() {
    setErrorModal(null);
    setForm(emptyForm);
    setAmbitoNueva(filtroAmbito === "mias" ? "privado" : "compartido");
    setModal({ mode: "create" });
  }

  function openEdit(modelo: Modelo) {
    setErrorModal(null);
    setForm({
      nombre: modelo.nombre,
      nombre_real: modelo.nombre_real ?? "",
      email: modelo.email ?? "",
      telefono: modelo.telefono ?? "",
      notas: modelo.notas ?? "",
      porcentaje_comision: modelo.porcentaje_comision ?? 70,
    });
    setModal({ mode: "edit", modelo });
  }

  async function submitModal() {
    if (!form.nombre.trim() || !modal) return;
    setSaving(true);
    setErrorModal(null);
    try {
      if (modal.mode === "create") {
        const res = await fetch("/api/modelos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, ambito: ambitoNueva }),
        });
        const payload = (await res.json().catch(() => ({}))) as { data?: Modelo; error?: string };
        if (res.ok && payload.data) {
          setModelos((prev) => [...prev, payload.data as Modelo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
          setModal(null);
        } else {
          setErrorModal(payload.error ?? "No se pudo crear la modelo");
        }
      } else {
        const res = await fetch(`/api/modelos/${modal.modelo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          setModelos((prev) => prev.map((m) => (m.id === modal.modelo.id ? { ...m, ...form } : m)));
          setModal(null);
        } else {
          setErrorModal(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo guardar");
        }
      }
    } catch {
      setErrorModal("No se pudo conectar con el servidor. Inténtalo otra vez.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAmbito(modelo: Modelo) {
    const siguiente = esCompartida(modelo) ? "privado" : "compartido";
    const aviso =
      siguiente === "compartido"
        ? `¿Compartir a ${modelo.nombre} con tu socio? Verá su ficha, vídeos, OnlyFans, cuentas y facturación.`
        : `¿Dejar de compartir a ${modelo.nombre}? Tu socio dejará de verla.`;
    if (!window.confirm(aviso)) return;
    setModelos((prev) => prev.map((m) => (m.id === modelo.id ? { ...m, ambito: siguiente } : m)));
    const res = await fetch(`/api/modelos/${modelo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ambito: siguiente }) });
    if (!res.ok) setModelos((prev) => prev.map((m) => (m.id === modelo.id ? { ...m, ambito: modelo.ambito } : m)));
  }

  async function eliminarModelo(modelo: Modelo) {
    // Sin ventana de confirmacion: va a la papelera y se puede restaurar
    const res = await fetch(`/api/modelos/${modelo.id}`, { method: "DELETE" });
    if (res.ok) setModelos((prev) => prev.filter((m) => m.id !== modelo.id));
    else window.alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo eliminar");
  }

  async function borrarParaSiempre() {
    if (!borrarDef) return;
    setBorrandoDef(true);
    setErrorDef(null);
    try {
      const res = await fetch(`/api/modelos/${borrarDef.id}/papelera`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar: borrarDef.nombre }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; archivos?: number };
      if (res.ok) {
        window.alert(`Modelo eliminada para siempre. Se han borrado ${j.archivos ?? 0} archivos del almacén.`);
        window.location.reload();
      } else setErrorDef(j.error ?? "No se pudo borrar");
    } catch {
      setErrorDef("No se pudo conectar con el servidor.");
    } finally {
      setBorrandoDef(false);
    }
  }

  async function restaurarModelo(modelo: Modelo) {
    const res = await fetch(`/api/modelos/${modelo.id}/restaurar`, { method: "POST" });
    if (res.ok) window.location.reload();
    else window.alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo restaurar");
  }

  async function toggleActiva(modelo: Modelo) {
    const nextActiva = !modelo.activa;
    setModelos((prev) => prev.map((m) => (m.id === modelo.id ? { ...m, activa: nextActiva } : m)));
    await fetch(`/api/modelos/${modelo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: nextActiva }),
    });
  }

  async function addCuenta(modeloId: string) {
    const draft = cuentaDrafts[modeloId] ?? { red_social: "instagram", username: "" };
    const username = draft.username.trim();
    if (!username) return;
    setCuentaErrors((prev) => ({ ...prev, [modeloId]: "" }));
    const res = await fetch(`/api/modelos/${modeloId}/cuentas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, red_social: draft.red_social }),
    });
    const payload = await res.json();
    if (res.ok && payload.data) {
      setCuentas((prev) => [...prev, payload.data as CuentaInstagram]);
      setCuentaDrafts((prev) => ({ ...prev, [modeloId]: { ...draft, username: "" } }));
    } else {
      setCuentaErrors((prev) => ({ ...prev, [modeloId]: payload.error ?? "No se pudo añadir la cuenta" }));
    }
  }

  async function toggleCuentaActiva(cuenta: CuentaInstagram) {
    const nextActiva = !cuenta.activa;
    setCuentas((prev) => prev.map((c) => (c.id === cuenta.id ? { ...c, activa: nextActiva } : c)));
    await fetch(`/api/cuentas/${cuenta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: nextActiva }),
    });
  }

  function openEditCuenta(cuenta: CuentaInstagram) {
    setCuentaEdit({ cuenta, red_social: redCuenta(cuenta), username: cuenta.username });
  }

  async function submitCuentaEdit() {
    if (!cuentaEdit || !cuentaEdit.username.trim()) return;
    setCuentaSaving(true);
    try {
      const res = await fetch(`/api/cuentas/${cuentaEdit.cuenta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cuentaEdit.username, red_social: cuentaEdit.red_social }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.data) {
        setCuentaEdit((prev) => (prev ? { ...prev, error: payload.error ?? "No se pudo guardar la cuenta" } : prev));
        return;
      }
      const updated = payload.data as CuentaInstagram;
      setCuentas((prev) =>
        prev.map((cuenta) =>
          cuenta.id === cuentaEdit.cuenta.id
            ? { ...cuenta, ...updated, red_social: updated.red_social ?? cuentaEdit.red_social }
            : cuenta,
        ),
      );
      setCuentaEdit(null);
    } finally {
      setCuentaSaving(false);
    }
  }

  async function deleteCuenta(cuenta: CuentaInstagram) {
    if (!confirm(`¿Eliminar @${cuenta.username} de esta modelo?`)) return;
    const res = await fetch(`/api/cuentas/${cuenta.id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      setCuentas((prev) => prev.filter((item) => item.id !== cuenta.id));
    } else {
      setCuentaErrors((prev) => ({ ...prev, [cuenta.modelo_id]: payload.error ?? "No se pudo eliminar la cuenta" }));
    }
  }

  function openMetricool(cuenta: CuentaInstagram) {
    setMetricoolBlogId(cuenta.metricool_blog_id ?? "");
    setMetricoolModal(cuenta);
  }

  async function submitMetricool() {
    if (!metricoolModal || !metricoolBlogId.trim()) return;
    setMetricoolSaving(true);
    try {
      const res = await fetch(`/api/cuentas/${metricoolModal.id}/conectar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricool_blog_id: metricoolBlogId.trim() }),
      });
      const payload = await res.json();
      if (res.ok && payload.data) {
        setCuentas((prev) => prev.map((c) => (c.id === metricoolModal.id ? { ...c, ...payload.data } : c)));
        setMetricoolModal(null);
      }
    } finally {
      setMetricoolSaving(false);
    }
  }

  async function desconectarMetricool() {
    if (!metricoolModal) return;
    setMetricoolSaving(true);
    try {
      const res = await fetch(`/api/cuentas/${metricoolModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricool_blog_id: null, metricool_estado: "no_conectada" }),
      });
      if (res.ok) {
        setCuentas((prev) =>
          prev.map((c) => (c.id === metricoolModal.id ? { ...c, metricool_blog_id: null, metricool_estado: "no_conectada" } : c)),
        );
        setMetricoolModal(null);
      }
    } finally {
      setMetricoolSaving(false);
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {esDueno ? (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["todas", `Todas (${modelos.length})`],
                ["mias", `Mis modelos (${modelos.filter((m) => !esCompartida(m)).length})`],
                ["compartidas", `Compartidas con mi socio (${modelos.filter(esCompartida).length})`],
              ] as const
            ).map(([id, etiqueta]) => (
              <button
                key={id}
                onClick={() => setFiltroAmbito(id)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${filtroAmbito === id ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/20 text-white" : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white/80"}`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
          <Plus className="h-4 w-4" /> Nueva modelo
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map((modelo) => {
          const pipelineCount = pipelineByModelo[modelo.id] ?? 0;
          const cuentasModelo = cuentasPorModelo[modelo.id] ?? [];
          const draftCuenta = cuentaDrafts[modelo.id] ?? { red_social: "instagram" as SocialNetwork, username: "" };

          return (
            <GlassCard key={modelo.id} className="flex h-full flex-col p-5">
              <div className="flex items-start gap-4">
                <FotoModelo modeloId={modelo.id} nombre={modelo.nombre} version={fotoByModelo[modelo.id] ?? null} className="h-20 w-20 rounded-2xl text-3xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/modelos/${modelo.id}`} className="truncate font-display text-2xl font-semibold text-white hover:text-[#A78BFA]">
                      {modelo.nombre}
                    </Link>
                    <div className="flex shrink-0 gap-1.5">
                      <button onClick={() => openEdit(modelo)} className="btn-secondary grid h-8 w-8 place-items-center p-0" aria-label="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => eliminarModelo(modelo)}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] p-0 text-white/45 transition hover:border-red-400/40 hover:text-red-300"
                        aria-label="Eliminar modelo"
                        title="Eliminar (va a la papelera)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {esDueno ? (
                    <button
                      onClick={() => toggleAmbito(modelo)}
                      title={esCompartida(modelo) ? "Compartida con tu socio: pulsa para dejar de compartirla" : "Solo tuya: pulsa para compartirla con tu socio"}
                      className={`mr-2 mt-2 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${esCompartida(modelo) ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/[0.04] text-white/45 hover:text-white/75"}`}
                    >
                      {esCompartida(modelo) ? "👥 Compartida" : "🔒 Solo mía"}
                    </button>
                  ) : null}
                  <button
                    onClick={() => toggleActiva(modelo)}
                    className="mt-2"
                    title="Cambiar estado activa/inactiva"
                  >
                    <Badge status={modelo.activa ? "cobrado" : "atrasado"}>{modelo.activa ? "Activa" : "Inactiva"}</Badge>
                  </button>
                  <Link
                    href={`/modelos/${modelo.id}#onboarding`}
                    className={`ml-2 mt-2 inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      onboardingByModelo[modelo.id] === "enviado"
                        ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                        : onboardingByModelo[modelo.id] === "borrador"
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                          : "border-white/10 bg-white/[0.04] text-white/40"
                    }`}
                  >
                    Onboarding:{" "}
                    {onboardingByModelo[modelo.id] === "enviado" ? "enviado" : onboardingByModelo[modelo.id] === "borrador" ? "a medias" : "sin empezar"}
                  </Link>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <Metric label="Pipeline" value={pipelineCount.toString()} />
                <Metric label="Redes" value={cuentasModelo.length.toString()} />
              </div>

              <div className="mt-5 flex-1">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                  <AtSign className="h-3.5 w-3.5" /> Redes sociales
                </p>
                <div className="flex flex-col gap-1.5">
                  {cuentasModelo.length === 0 ? (
                    <p className="text-xs text-[color:var(--text-muted)]">Sin redes todavia</p>
                  ) : (
                    cuentasModelo.map((cuenta) => {
                      const estado = cuenta.metricool_estado ?? "no_conectada";
                      const red = redCuenta(cuenta);
                      return (
                        <div
                          key={cuenta.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/80"
                        >
                          <button
                            onClick={() => toggleCuentaActiva(cuenta)}
                            className="min-w-0 flex-1 truncate text-left font-code hover:text-white"
                            title="Cambiar activa/pausada"
                          >
                            {SOCIAL_PREFIX[red]}{cuenta.username}
                          </button>
                          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/45">
                            {SOCIAL_LABEL[red]}
                          </span>
                          <span className={cuenta.activa ? "text-emerald-400" : "text-white/30"}>{cuenta.activa ? "Activa" : "Pausada"}</span>
                          {red === "instagram" ? (
                            <>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${METRICOOL_DOT[estado]}`} title={METRICOOL_TITLE[estado]} />
                              <button
                                onClick={() => openMetricool(cuenta)}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/10 text-white/50 transition hover:border-white/25 hover:text-white"
                                title="Conectar con Metricool"
                              >
                                <Plug className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : null}
                          <button
                            onClick={() => openEditCuenta(cuenta)}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/10 text-white/50 transition hover:border-white/25 hover:text-white"
                            title="Editar cuenta"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteCuenta(cuenta)}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/10 text-white/45 transition hover:border-red-400/30 hover:text-red-300"
                            title="Eliminar cuenta"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-[118px_1fr_auto]">
                  <select
                    value={draftCuenta.red_social}
                    onChange={(event) =>
                      setCuentaDrafts((prev) => ({
                        ...prev,
                        [modelo.id]: { ...draftCuenta, red_social: event.target.value as SocialNetwork },
                      }))
                    }
                    className="input-base py-1.5 text-xs"
                  >
                    <option value="instagram">Instagram</option>
                    <option value="twitter">Twitter / X</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                  <input
                    value={draftCuenta.username}
                    onChange={(event) =>
                      setCuentaDrafts((prev) => ({
                        ...prev,
                        [modelo.id]: { ...draftCuenta, username: event.target.value },
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addCuenta(modelo.id);
                    }}
                    placeholder={SOCIAL_PLACEHOLDER[draftCuenta.red_social]}
                    className="input-base flex-1 py-1.5 text-xs"
                  />
                  <button onClick={() => addCuenta(modelo.id)} className="btn-secondary min-h-10 px-3 py-1.5 text-xs">
                    Anadir
                  </button>
                </div>
                {cuentaErrors[modelo.id] ? <p className="mt-1.5 text-xs text-red-300">{cuentaErrors[modelo.id]}</p> : null}
              </div>

              <div className="mt-4 border-t border-white/[0.05] pt-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Portal de subida</p>
                  <PortalAccesoButton modeloId={modelo.id} nombre={modelo.nombre} />
                </div>
                {modelo.portal_token ? (
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/m/${modelo.portal_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 font-code text-[10px] text-[#A78BFA] hover:text-[#C4B5FD]"
                    >
                      /m/{modelo.portal_token}
                    </a>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(`${window.location.origin}/m/${modelo.portal_token}`);
                        setCopiedPortalId(modelo.id);
                        setTimeout(() => setCopiedPortalId(null), 2000);
                      }}
                      className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-white/50 transition hover:border-white/20 hover:text-white"
                    >
                      {copiedPortalId === modelo.id ? "✓ Copiado" : "Copiar"}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[color:var(--text-muted)]">Aún no tiene acceso al portal: pulsa «Portal» para crearlo.</p>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>

      {esDueno && papelera.length ? (
        <details className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white/80">
            Papelera ({papelera.length}) <span className="font-normal text-white/40">· modelos eliminadas, con todo su contenido guardado</span>
          </summary>
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {papelera.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{m.nombre}</p>
                  <p className="text-xs text-white/40">
                    Eliminada {m.eliminada_at ? new Date(m.eliminada_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                    {m.eliminada_por ? ` por ${m.eliminada_por}` : ""}
                  </p>
                </div>
                <button onClick={() => restaurarModelo(m)} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20">
                  Restaurar
                </button>
                <button
                  onClick={() => {
                    setErrorDef(null);
                    setBorrarDef(m);
                  }}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-300/80 hover:bg-red-500/10 hover:text-red-300"
                >
                  Eliminar para siempre
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ConfirmacionDoble
        abierto={Boolean(borrarDef)}
        titulo={`Eliminar a ${borrarDef?.nombre ?? ""} para siempre`}
        detalle="Se borrará la modelo y TODO lo suyo: sus archivos del almacenamiento (vídeos originales y editados, contenido de OnlyFans, virales y foto, para liberar espacio), sus cuentas, facturación y perfil, y también las copias de seguridad de la papelera. No habrá forma de recuperar nada."
        nombre={borrarDef?.nombre ?? ""}
        ocupado={borrandoDef}
        error={errorDef}
        onConfirmar={borrarParaSiempre}
        onCancelar={() => setBorrarDef(null)}
      />

      {modal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-md p-6">
            <h2 className="font-display text-xl font-semibold text-white">
              {modal.mode === "create" ? "Nueva modelo" : "Editar modelo"}
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              <Field label="Nombre">
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="input-base" />
              </Field>
              <Field label="Nombre real">
                <input value={form.nombre_real} onChange={(e) => setForm({ ...form, nombre_real: e.target.value })} className="input-base" />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-base" />
              </Field>
              <Field label="Telefono">
                <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="input-base" />
              </Field>
              <Field label="Notas">
                <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} className="input-base resize-none" />
              </Field>
              {esDueno && modal?.mode === "create" ? (
                <Field label="¿De quién es?">
                  <select value={ambitoNueva} onChange={(e) => setAmbitoNueva(e.target.value as "compartido" | "privado")} className="input-base">
                    <option value="compartido">Compartida con mi socio</option>
                    <option value="privado">Solo mía (mi socio no la ve)</option>
                  </select>
                </Field>
              ) : null}
              <Field label={`Comision agencia: ${form.porcentaje_comision}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={form.porcentaje_comision}
                  onChange={(e) => setForm({ ...form, porcentaje_comision: Number(e.target.value) })}
                  className="w-full accent-[#8B5CF6]"
                />
              </Field>
            </div>
            {errorModal ? <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{errorModal}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary px-4 py-2 text-sm">
                Cancelar
              </button>
              <button onClick={submitModal} disabled={saving || !form.nombre.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </GlassCard>
        </div>
      ) : null}

      {metricoolModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-sm p-6">
            <h2 className="font-display text-lg font-semibold text-white">Conectar con Metricool</h2>
            <p className="mt-1 text-xs text-white/40">
              @{metricoolModal.username} · pega el Blog ID de Metricool para sincronizar estadisticas.
            </p>
            <div className="mt-4">
              <Field label="Metricool Blog ID">
                <input
                  value={metricoolBlogId}
                  onChange={(e) => setMetricoolBlogId(e.target.value)}
                  placeholder="Ej. 4051234"
                  className="input-base"
                />
              </Field>
            </div>
            <div className="mt-6 flex items-center justify-between gap-2">
              {metricoolModal.metricool_blog_id ? (
                <button onClick={desconectarMetricool} disabled={metricoolSaving} className="btn-secondary px-3 py-2 text-xs text-red-300 disabled:opacity-40">
                  Desconectar
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button onClick={() => setMetricoolModal(null)} className="btn-secondary px-4 py-2 text-sm">
                  Cancelar
                </button>
                <button
                  onClick={submitMetricool}
                  disabled={metricoolSaving || !metricoolBlogId.trim()}
                  className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
                >
                  {metricoolSaving ? "Guardando..." : "Conectar"}
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      ) : null}

      {cuentaEdit ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <GlassCard className="w-full max-w-sm p-6">
            <h2 className="font-display text-lg font-semibold text-white">Editar cuenta</h2>
            <div className="mt-4 space-y-3">
              <Field label="Red social">
                <select
                  value={cuentaEdit.red_social}
                  onChange={(event) => setCuentaEdit({ ...cuentaEdit, red_social: event.target.value as SocialNetwork, error: "" })}
                  className="input-base"
                >
                  <option value="instagram">Instagram</option>
                  <option value="twitter">Twitter / X</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </Field>
              <Field label="Usuario">
                <input
                  value={cuentaEdit.username}
                  onChange={(event) => setCuentaEdit({ ...cuentaEdit, username: event.target.value, error: "" })}
                  placeholder={SOCIAL_PLACEHOLDER[cuentaEdit.red_social]}
                  className="input-base"
                />
              </Field>
              {cuentaEdit.error ? <p className="text-xs text-red-300">{cuentaEdit.error}</p> : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setCuentaEdit(null)} className="btn-secondary px-4 py-2 text-sm">
                Cancelar
              </button>
              <button onClick={submitCuentaEdit} disabled={cuentaSaving || !cuentaEdit.username.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
                {cuentaSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </GlassCard>
        </div>
      ) : null}

    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[color:var(--text-secondary)]">
      {label}
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
      <p className="text-xs text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-2 font-display text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
