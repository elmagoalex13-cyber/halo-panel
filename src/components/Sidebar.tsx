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
              return (
                <Link
                  key={href}
                  href={href}
                  className={`group relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
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
