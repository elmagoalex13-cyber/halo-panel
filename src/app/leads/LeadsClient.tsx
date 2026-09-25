"use client";

import { useMemo, useState } from "react";
import { Archive, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, ImageIcon, Mail, MessageCircle, Phone, Save, Trash2, UserRound, Video, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Lead, LeadAdjunto, LeadEstado } from "@/types";

const TABS: Array<{ estado: LeadEstado; label: string; hint: string; icon: LucideIcon; tone: "violet" | "cyan" | "emerald" | "amber" | "red" }> = [
  { estado: "nuevo", label: "Nuevos", hint: "Sin tocar", icon: Clock3, tone: "violet" },
  { estado: "contactado", label: "Contactados", hint: "Ya hablaste", icon: MessageCircle, tone: "cyan" },
  { estado: "captado", label: "Captados", hint: "Se quedan", icon: CheckCircle2, tone: "emerald" },
  { estado: "futuro", label: "Para futuro", hint: "Interesa luego", icon: Archive, tone: "amber" },
  { estado: "descartado", label: "Descartados", hint: "No encaja", icon: Trash2, tone: "red" },
];

const ESTADO_LABEL: Record<LeadEstado, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  captado: "Captado",
  futuro: "Para futuro",
  descartado: "Descartado",
  eliminado: "Eliminado",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function whatsappHref(value?: string | null) {
  const digits = value?.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

function instagramHref(value?: string | null) {
  const text = value?.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  const user = text.replace(/^@/, "");
  return `https://instagram.com/${user}`;
}

function statusClass(estado: LeadEstado) {
  if (estado === "captado") return "badge-aprobado";
  if (estado === "contactado") return "badge-aprobacion";
  if (estado === "futuro") return "badge-clasificando";
  if (estado === "descartado" || estado === "eliminado") return "badge-rechazado";
  return "badge-recibido";
}

function formatBytes(value?: number | null) {
  if (!value) return "";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function downloadHref(adjunto: LeadAdjunto) {
  const params = new URLSearchParams({ key: adjunto.key || adjunto.url, name: adjunto.name });
  return `/api/leads/adjuntos/descargar?${params.toString()}`;
}

function tabTone(tone: "violet" | "cyan" | "emerald" | "amber" | "red", active: boolean) {
  const tones = {
    violet: active
      ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/18 text-white shadow-[0_0_28px_rgba(139,92,246,0.18)]"
      : "border-[#8B5CF6]/18 bg-[#8B5CF6]/[0.04] text-white/65 hover:bg-[#8B5CF6]/[0.08]",
    cyan: active
      ? "border-cyan-400/60 bg-cyan-400/15 text-white shadow-[0_0_28px_rgba(34,211,238,0.14)]"
      : "border-cyan-400/15 bg-cyan-400/[0.035] text-white/65 hover:bg-cyan-400/[0.07]",
    emerald: active
      ? "border-emerald-400/60 bg-emerald-400/15 text-white shadow-[0_0_28px_rgba(52,211,153,0.14)]"
      : "border-emerald-400/15 bg-emerald-400/[0.035] text-white/65 hover:bg-emerald-400/[0.07]",
    amber: active
      ? "border-amber-300/60 bg-amber-300/15 text-white shadow-[0_0_28px_rgba(252,211,77,0.12)]"
      : "border-amber-300/15 bg-amber-300/[0.035] text-white/65 hover:bg-amber-300/[0.07]",
    red: active
      ? "border-red-400/60 bg-red-400/15 text-white shadow-[0_0_28px_rgba(248,113,113,0.12)]"
      : "border-red-400/15 bg-red-400/[0.035] text-white/65 hover:bg-red-400/[0.07]",
  };
  return tones[tone];
}

function iconTone(tone: "violet" | "cyan" | "emerald" | "amber" | "red") {
  return {
    violet: "bg-[#8B5CF6]/18 text-[#C4B5FD]",
    cyan: "bg-cyan-400/15 text-cyan-200",
    emerald: "bg-emerald-400/15 text-emerald-200",
    amber: "bg-amber-300/15 text-amber-100",
    red: "bg-red-400/15 text-red-200",
  }[tone];
}

export function LeadsClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [active, setActive] = useState<LeadEstado>("nuevo");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ title: string; items: LeadAdjunto[]; index: number } | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialLeads.map((lead) => [lead.id, lead.notas ?? ""])),
  );

  const counts = useMemo(() => {
    return leads.reduce<Record<LeadEstado, number>>(
      (acc, lead) => {
        acc[lead.estado] += 1;
        return acc;
      },
      { nuevo: 0, contactado: 0, captado: 0, futuro: 0, descartado: 0, eliminado: 0 },
    );
  }, [leads]);

  const visible = leads.filter((lead) => lead.estado === active);
  const currentAdjunto = viewer?.items[viewer.index] ?? null;

  async function updateLead(id: string, body: Record<string, unknown>) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setLeads((current) =>
        current.map((lead) => {
          if (lead.id !== id) return lead;
          const estado = (body.eliminar_datos ? "eliminado" : body.estado ?? lead.estado) as LeadEstado;
          return {
            ...lead,
            estado,
            notas: typeof body.notas === "string" ? body.notas : lead.notas,
            seguimiento_at: typeof body.seguimiento_at === "string" ? body.seguimiento_at : lead.seguimiento_at,
            nombre: body.eliminar_datos ? null : lead.nombre,
            email: body.eliminar_datos ? null : lead.email,
            whatsapp: body.eliminar_datos ? null : lead.whatsapp,
            instagram: body.eliminar_datos ? null : lead.instagram,
            pais: body.eliminar_datos ? null : lead.pais,
            adjuntos: body.eliminar_datos ? [] : lead.adjuntos,
          };
        }),
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-[color:var(--text-secondary)]">Recepcion de formularios desde la web</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white">Leads</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = active === tab.estado;
            return (
            <button
              key={tab.estado}
              type="button"
              onClick={() => setActive(tab.estado)}
              className={`min-h-20 rounded-2xl border p-3 text-left transition ${tabTone(tab.tone, selected)}`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className={`grid h-8 w-8 place-items-center rounded-xl ${iconTone(tab.tone)}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-display text-2xl font-semibold text-white">{counts[tab.estado]}</span>
              </span>
              <span className="mt-2 block font-semibold">{tab.label}</span>
              <span className="mt-0.5 block text-xs text-white/40">{tab.hint}</span>
            </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const total = Math.max(1, leads.filter((lead) => lead.estado !== "eliminado").length);
          const pct = Math.round((counts[tab.estado] / total) * 100);
          return (
          <div key={tab.estado} className={`rounded-2xl border p-4 ${tabTone(tab.tone, active === tab.estado)}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/35">{tab.label}</p>
              <Icon className="h-4 w-4 text-white/45" />
            </div>
            <p className="mt-2 font-display text-3xl font-semibold text-white">{counts[tab.estado]}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full bg-white/60" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-white/35">{pct}% del total</p>
          </div>
          );
        })}
      </div>

      <div className="mt-6 space-y-4">
        {visible.length === 0 ? (
          <div className="glass-card p-8 text-center text-sm text-white/40">No hay leads en este estado.</div>
        ) : null}

        {visible.map((lead) => {
          const wa = whatsappHref(lead.whatsapp);
          const ig = instagramHref(lead.instagram);
          const notes = draftNotes[lead.id] ?? "";
          return (
            <article key={lead.id} className="glass-card overflow-hidden">
              <div className="grid gap-0 xl:grid-cols-[1fr_360px]">
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-xl font-semibold text-white">{lead.nombre ?? "Lead sin datos"}</h2>
                        <span className={`badge ${statusClass(lead.estado)}`}>{ESTADO_LABEL[lead.estado]}</span>
                        <span className="badge">{lead.pais ?? "-"}</span>
                      </div>
                      <p className="mt-1 text-xs text-white/35">Entró el {formatDate(lead.created_at)} · {lead.origen}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {wa ? (
                        <a href={wa} target="_blank" rel="noreferrer" className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 text-sm">
                          <Phone className="h-4 w-4" />
                          WhatsApp
                        </a>
                      ) : null}
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 text-sm">
                          <Mail className="h-4 w-4" />
                          Email
                        </a>
                      ) : null}
                      {ig ? (
                        <a href={ig} target="_blank" rel="noreferrer" className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 text-sm">
                          <UserRound className="h-4 w-4" />
                          Perfil
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Info label="Experiencia" value={lead.experiencia} />
                    <Info label="Ingresos" value={lead.ingresos} />
                    <Info label="WhatsApp" value={lead.whatsapp} />
                    <Info label="Instagram" value={lead.instagram} />
                  </div>

                  <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/35">Necesita mejorar</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lead.necesidades.length ? lead.necesidades.map((item) => <span key={item} className="badge">{item}</span>) : <span className="text-sm text-white/35">Sin necesidades marcadas</span>}
                    </div>
                    {lead.otro_mensaje ? <p className="mt-3 text-sm leading-6 text-white/70">{lead.otro_mensaje}</p> : null}
                  </div>

                  {lead.adjuntos?.length ? (
                    <AdjuntosCompactos
                      adjuntos={lead.adjuntos}
                      onOpen={(index) => setViewer({ title: lead.nombre ?? "Lead", items: lead.adjuntos ?? [], index })}
                    />
                  ) : null}

                  <div className="mt-5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/35" htmlFor={`notes-${lead.id}`}>
                      Notas internas
                    </label>
                    <textarea
                      id={`notes-${lead.id}`}
                      value={notes}
                      onChange={(event) => setDraftNotes((current) => ({ ...current, [lead.id]: event.target.value }))}
                      className="input-base mt-2 min-h-24 resize-y"
                      placeholder="Qué se habló, si responde, objeciones, potencial, siguiente paso..."
                    />
                  </div>
                </div>

                <aside className="border-t border-white/[0.08] bg-white/[0.02] p-5 xl:border-l xl:border-t-0">
                  <div className="space-y-2">
                    <ActionButton icon={Save} label="Guardar nota" disabled={savingId === lead.id} onClick={() => updateLead(lead.id, { notas: notes })} />
                    <ActionButton icon={MessageCircle} label="Marcar contactado" disabled={savingId === lead.id} onClick={() => updateLead(lead.id, { estado: "contactado", notas: notes })} />
                    <ActionButton icon={CheckCircle2} label="Captar / guardar" disabled={savingId === lead.id} onClick={() => updateLead(lead.id, { estado: "captado", notas: notes })} tone="success" />
                    <ActionButton icon={Clock3} label="Para futuro" disabled={savingId === lead.id} onClick={() => updateLead(lead.id, { estado: "futuro", notas: notes })} />
                    <ActionButton icon={Archive} label="Descartar" disabled={savingId === lead.id} onClick={() => updateLead(lead.id, { estado: "descartado", notas: notes })} tone="warning" />
                    <ActionButton icon={Trash2} label="Eliminar datos" disabled={savingId === lead.id} onClick={() => updateLead(lead.id, { eliminar_datos: true })} tone="danger" />
                  </div>

                  <div className="mt-5 space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-4 text-xs text-white/40">
                    <p>Pagina: {lead.page_url ?? "-"}</p>
                    <p>Referrer: {lead.referrer ?? "-"}</p>
                    <p>Privacidad: {lead.acepta_privacidad ? "Aceptada" : "No aceptada"}</p>
                  </div>
                </aside>
              </div>
            </article>
          );
        })}
      </div>

      {viewer && currentAdjunto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-[#0b0912]/92 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{viewer.title}</p>
                <p className="truncate text-xs text-white/40">
                  {viewer.index + 1}/{viewer.items.length} · {currentAdjunto.name} {formatBytes(currentAdjunto.size) ? `· ${formatBytes(currentAdjunto.size)}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setViewer(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-white/[0.025] px-4 py-3">
              <p className="text-xs text-white/45">
                Puedes ver el archivo aqui o descargarlo para guardarlo.
              </p>
              <a
                href={downloadHref(currentAdjunto)}
                className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 text-sm"
              >
                <Download className="h-4 w-4" />
                Descargar
              </a>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1fr_180px]">
              <div className="relative flex min-h-[55vh] items-center justify-center bg-black">
                {viewer.items.length > 1 ? (
                  <>
                    <button type="button" onClick={() => setViewer((current) => current ? { ...current, index: (current.index - 1 + current.items.length) % current.items.length } : current)} className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80" aria-label="Anterior">
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button type="button" onClick={() => setViewer((current) => current ? { ...current, index: (current.index + 1) % current.items.length } : current)} className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80" aria-label="Siguiente">
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </>
                ) : null}

                {currentAdjunto.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentAdjunto.url} alt={currentAdjunto.name} className="max-h-[72vh] w-auto max-w-full object-contain" />
                ) : (
                  <video key={currentAdjunto.key} src={currentAdjunto.url} className="max-h-[72vh] w-auto max-w-full" controls playsInline preload="metadata" />
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto border-t border-white/[0.08] bg-white/[0.02] p-3 lg:max-h-[72vh] lg:flex-col lg:overflow-y-auto lg:border-l lg:border-t-0">
                {viewer.items.map((adjunto, index) => (
                  <div
                    key={adjunto.key}
                    className={`flex w-44 shrink-0 items-center gap-2 rounded-xl border p-2 transition lg:w-full ${index === viewer.index ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/15" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setViewer((current) => current ? { ...current, index } : current)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/40">
                        {adjunto.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={adjunto.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <Video className="h-5 w-5 text-white/55" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-white/75">{adjunto.name}</span>
                        <span className="mt-0.5 block text-[11px] text-white/35">{formatBytes(adjunto.size)}</span>
                      </span>
                    </button>
                    <a
                      href={downloadHref(adjunto)}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/55 transition hover:border-white/20 hover:text-white"
                      aria-label={`Descargar ${adjunto.name}`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdjuntosCompactos({ adjuntos, onOpen }: { adjuntos: LeadAdjunto[]; onOpen: (index: number) => void }) {
  const first = adjuntos[0];
  const fotos = adjuntos.filter((item) => item.kind === "image").length;
  const videos = adjuntos.filter((item) => item.kind === "video").length;

  return (
    <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/35">Fotos y videos</p>
          <p className="mt-1 text-sm text-white/60">
            {adjuntos.length} archivo{adjuntos.length === 1 ? "" : "s"} · {fotos} foto{fotos === 1 ? "" : "s"} · {videos} video{videos === 1 ? "" : "s"}
          </p>
        </div>
        <button type="button" onClick={() => onOpen(0)} className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 text-sm">
          <ImageIcon className="h-4 w-4" />
          Ver archivos
        </button>
        <a href={downloadHref(first)} className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 text-sm">
          <Download className="h-4 w-4" />
          Descargar
        </a>
      </div>
      <div className="mt-3 flex gap-2 overflow-hidden">
        {adjuntos.slice(0, 4).map((adjunto, index) => (
          <div key={adjunto.key} className="relative h-20 w-16 shrink-0">
            <button
              type="button"
              onClick={() => onOpen(index)}
              className="h-full w-full overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03]"
              aria-label={`Ver ${adjunto.name}`}
            >
              {adjunto.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={adjunto.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="grid h-full w-full place-items-center bg-black/40">
                  <Video className="h-5 w-5 text-white/65" />
                </span>
              )}
            </button>
            <a
              href={downloadHref(adjunto)}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md bg-black/70 text-white/80 ring-1 ring-white/15 backdrop-blur transition hover:bg-black hover:text-white"
              aria-label={`Descargar ${adjunto.name}`}
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
        {adjuntos.length > 4 ? (
          <button type="button" onClick={() => onOpen(4)} className="grid h-20 w-16 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-sm font-semibold text-white/65">
            +{adjuntos.length - 4}
          </button>
        ) : null}
        <button type="button" onClick={() => onOpen(0)} className="ml-auto hidden min-w-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-left text-xs text-white/55 transition hover:bg-white/[0.06] md:flex">
          {first.kind === "video" ? <Video className="h-4 w-4 shrink-0" /> : <ImageIcon className="h-4 w-4 shrink-0" />}
          <span className="truncate">{first.name}</span>
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <p className="text-xs text-white/35">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-white/80">{value || "-"}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: typeof Save;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const classes = {
    default: "border-white/[0.1] bg-white/[0.04] text-white/75 hover:bg-white/[0.07]",
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15",
    warning: "border-amber-300/25 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15",
    danger: "border-red-400/25 bg-red-400/10 text-red-200 hover:bg-red-400/15",
  }[tone];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50 ${classes}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
