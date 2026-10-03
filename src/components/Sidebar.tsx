"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/aprobacion", label: "Aprobación", icon: "⏳", badge: true },
  { href: "/leads", label: "Leads", icon: "◇", leadsBadge: true },
  { href: "/asignar", label: "Asignar vídeos", icon: "⇪" },
  { href: "/instagram", label: "Instagram", icon: "◎" },
  { href: "/landings", label: "Landings", icon: "◇" },
  { href: "/modelos", label: "Modelos", icon: "◉" },
  { href: "/frases", label: "Frases", icon: "✦" },
  { href: "/facturacion", label: "Facturación", icon: "◎" },
  { href: "/logs", label: "Actividad", icon: "◌" },
  { href: "/vault", label: "Vault", icon: "◆" },
  { href: "/ajustes", label: "Ajustes", icon: "⚙" },
];

export const EVENTO_MODELOS = "halo:modelos-actualizados";

type ModeloMenu = { id: string; nombre: string; activa: boolean; portal_token: string | null; foto: number | null };

function AvatarMini({ modelo }: { modelo: ModeloMenu }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-white/[0.12] bg-white/[0.06] text-[11px] font-semibold text-white/80">
      {modelo.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/modelos/${modelo.id}/foto?v=${modelo.foto}`} alt="" className="h-full w-full object-cover" />
      ) : (
        modelo.nombre.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

const MOBILE_PRIMARY = ["/dashboard", "/aprobacion", "/leads", "/modelos"];

interface SidebarProps {
  pendingAprobacion?: number;
  pendingLeads?: number;
}

export function Sidebar({ pendingAprobacion = 0, pendingLeads = 0 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [counts, setCounts] = useState({ approval: pendingAprobacion, leads: pendingLeads });
  const [modelos, setModelos] = useState<ModeloMenu[]>([]);
  const [modelosAbierto, setModelosAbierto] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem("halo-sidebar-modelos") === "cerrado") setModelosAbierto(false);
    } catch {}
  }, []);

  useEffect(() => {
    let disposed = false;
    async function cargarModelos() {
      try {
        const res = await fetch("/api/panel/modelos", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { modelos?: ModeloMenu[] };
        if (!disposed) setModelos(data.modelos ?? []);
      } catch {
        // El menu no debe bloquear la navegacion si falla la lista.
      }
    }
    void cargarModelos();
    window.addEventListener("focus", cargarModelos);
    window.addEventListener(EVENTO_MODELOS, cargarModelos);
    return () => {
      disposed = true;
      window.removeEventListener("focus", cargarModelos);
      window.removeEventListener(EVENTO_MODELOS, cargarModelos);
    };
  }, []);

  function alternarModelos() {
    setModelosAbierto((abierto) => {
      try {
        localStorage.setItem("halo-sidebar-modelos", abierto ? "cerrado" : "abierto");
      } catch {}
      return !abierto;
    });
  }

  useEffect(() => {
    let disposed = false;

    async function loadCounts() {
      try {
        const res = await fetch("/api/panel/counts", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { approval?: number; leads?: number };
        if (!disposed) {
          setCounts({
            approval: Number(data.approval ?? 0),
            leads: Number(data.leads ?? 0),
          });
        }
      } catch {
        // El menú no debe bloquear la navegación si los contadores fallan.
      }
    }

    loadCounts();
    const interval = window.setInterval(loadCounts, 30000);
    window.addEventListener("focus", loadCounts);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", loadCounts);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function activeFor(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  }

  function badgeFor(item: (typeof NAV)[number]) {
    if (item.badge && counts.approval > 0) return counts.approval > 99 ? "99+" : String(counts.approval);
    if (item.leadsBadge && counts.leads > 0) return counts.leads > 99 ? "99+" : String(counts.leads);
    return null;
  }

  const primaryItems = NAV.filter((item) => MOBILE_PRIMARY.includes(item.href));
  const moreItems = NAV.filter((item) => !MOBILE_PRIMARY.includes(item.href));

  return (
    <>
      {/* Escritorio: panel de cristal fijo */}
      <aside
        className="sidebar fixed left-0 top-0 z-30 hidden h-screen w-[224px] shrink-0 flex-col overflow-y-auto md:flex"
      >
        <div className="border-b border-white/[0.08] p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.14] bg-gradient-to-br from-[#8B5CF6]/35 to-[#A78BFA]/10 text-lg text-[#C4B5FD] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
              ◈
            </span>
            <div>
              <div className="text-[13px] font-bold tracking-[0.05em] text-white/90">HALO</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/40">Models Panel</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="flex flex-col gap-1 px-3">
            {NAV.map((item) => {
              const { href, label, icon, leadsBadge } = item;
              const active = activeFor(href);
              const badgeText = badgeFor(item);
              const esModelos = href === "/modelos";
              return (
                <div key={href} className={esModelos ? "relative" : undefined}>
                <Link
                  href={href}
                  className={`group relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-150 ${esModelos ? "pr-10 " : ""}${
                    active
                      ? "border-[#A78BFA]/30 bg-[#8B5CF6]/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_20px_-8px_rgba(139,92,246,0.6)]"
                      : "border-transparent text-white/50 hover:border-white/[0.08] hover:bg-white/[0.05] hover:text-white/85"
                  }`}
                >
                  <span className={`text-[15px] leading-none ${active ? "text-[#C4B5FD]" : ""}`}>{icon}</span>
                  <span className="flex-1">{label}</span>
                  {badgeText ? (
                    <span
                      className={`min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold text-white shadow-[0_0_10px_-2px_rgba(139,92,246,0.8)] ${
                        leadsBadge ? "bg-[#06B6D4]" : "bg-[#8B5CF6]"
                      }`}
                    >
                      {badgeText}
                    </span>
                  ) : null}
                </Link>
                {esModelos ? (
                  <>
                    <button
                      type="button"
                      onClick={alternarModelos}
                      aria-expanded={modelosAbierto}
                      aria-label={modelosAbierto ? "Ocultar modelos" : "Mostrar modelos"}
                      className="absolute right-2 top-[11px] grid h-6 w-6 place-items-center rounded-lg text-xs text-white/45 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      <span className={`inline-block transition-transform ${modelosAbierto ? "rotate-180" : ""}`}>▾</span>
                    </button>
                    {modelosAbierto && modelos.length ? (
                      <ul className="mt-1 flex flex-col gap-0.5 border-l border-white/[0.08] pl-2 ml-5">
                        {modelos.map((m) => {
                          const activo = pathname === `/modelos/${m.id}`;
                          return (
                            <li key={m.id} className="group/m flex items-center gap-1">
                              <Link
                                href={`/modelos/${m.id}`}
                                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] transition ${
                                  activo ? "bg-[#8B5CF6]/[0.16] text-white" : "text-white/55 hover:bg-white/[0.05] hover:text-white/90"
                                } ${m.activa ? "" : "opacity-50"}`}
                              >
                                <AvatarMini modelo={m} />
                                <span className="truncate">{m.nombre}</span>
                              </Link>
                              {m.portal_token ? (
                                <a
                                  href={`/m/${m.portal_token}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Abrir el portal de ${m.nombre}`}
                                  aria-label={`Abrir el portal de ${m.nombre}`}
                                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-white/35 transition hover:bg-white/[0.08] hover:text-[#C4B5FD]"
                                >
                                  ↗
                                </a>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </>
                ) : null}
                </div>
              );
            })}
          </div>
        </nav>
        <div className="border-t border-white/[0.08] p-4">
          <button onClick={logout} className="btn-secondary mb-3 w-full py-2 text-xs">
            Salir
          </button>
          <div className="text-[10px] uppercase tracking-[0.12em] text-white/30">Panel de admin · Halo Agency</div>
        </div>
      </aside>

      {/* Movil: barra inferior de cristal */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.1] bg-[#0d0a16]/80 px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {primaryItems.map((item) => {
            const active = activeFor(item.href);
            const badgeText = badgeFor(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-semibold transition ${
                  active ? "bg-[#8B5CF6]/20 text-white ring-1 ring-[#8B5CF6]/35" : "text-white/48"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span className="max-w-full truncate">{item.label.replace("Aprobación", "Aprobar")}</span>
                {badgeText ? (
                  <span className="absolute right-1.5 top-1 rounded-full bg-[#8B5CF6] px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {badgeText}
                  </span>
                ) : null}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-semibold transition ${
              moreItems.some((item) => activeFor(item.href)) ? "bg-[#8B5CF6]/20 text-white ring-1 ring-[#8B5CF6]/35" : "text-white/48"
            }`}
          >
            <span className="text-base leading-none">•••</span>
            <span>Mas</span>
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden" role="dialog" aria-modal="true" onClick={() => setMoreOpen(false)}>
          <div
            className="glass-card absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-b-none rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-display text-lg font-semibold text-white">Panel de admin</p>
                <p className="text-xs text-white/40">Halo Agency</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70"
                aria-label="Cerrar menu"
              >
                x
              </button>
            </div>
            {modelos.length ? (
              <div className="mb-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/35">Modelos</p>
                <div className="grid grid-cols-2 gap-2">
                  {modelos.map((m) => (
                    <Link
                      key={m.id}
                      href={`/modelos/${m.id}`}
                      onClick={() => setMoreOpen(false)}
                      className={`flex min-h-12 items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 text-sm font-semibold text-white/75 ${m.activa ? "" : "opacity-50"}`}
                    >
                      <AvatarMini modelo={m} />
                      <span className="min-w-0 flex-1 truncate">{m.nombre}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => {
                const active = activeFor(item.href);
                const badgeText = badgeFor(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`relative flex min-h-14 items-center gap-3 rounded-2xl border px-3 text-sm font-semibold transition ${
                      active
                        ? "border-[#8B5CF6]/45 bg-[#8B5CF6]/18 text-white"
                        : "border-white/[0.08] bg-white/[0.035] text-white/65"
                    }`}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {badgeText ? <span className="rounded-full bg-[#8B5CF6] px-1.5 py-0.5 text-[10px] text-white">{badgeText}</span> : null}
                  </Link>
                );
              })}
            </div>
            <button type="button" onClick={logout} className="btn-secondary mt-3 flex min-h-12 w-full items-center justify-center text-sm">
              Salir
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
