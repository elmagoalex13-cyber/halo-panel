"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function activeFor(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  }

  function badgeFor(item: (typeof NAV)[number]) {
    if (item.badge && pendingAprobacion > 0) return pendingAprobacion > 99 ? "99+" : String(pendingAprobacion);
    if (item.leadsBadge && pendingLeads > 0) return pendingLeads > 99 ? "99+" : String(pendingLeads);
    return null;
  }

  const primaryItems = NAV.filter((item) => MOBILE_PRIMARY.includes(item.href));
  const moreItems = NAV.filter((item) => !MOBILE_PRIMARY.includes(item.href));

  return (
    <>
      <aside
        className="hidden md:flex"
        style={{
          width: "224px",
          flexShrink: 0,
          backgroundColor: "#151620",
          borderRight: "1px solid #1E2030",
          flexDirection: "column",
          height: "100vh",
          position: "fixed",
          top: 0,
          left: 0,
          overflowY: "auto",
          zIndex: 30,
        }}
      >
        <div style={{ padding: "20px", borderBottom: "1px solid #1E2030" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#7B5EFF", fontSize: "20px", fontWeight: "bold" }}>◈</span>
            <div>
              <div style={{ color: "#E8E9F0", fontSize: "13px", fontWeight: "700", letterSpacing: "0.05em" }}>
                HALO
              </div>
              <div style={{ color: "#6B6E85", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Models Panel
              </div>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: "16px 0", overflowY: "auto" }}>
          <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {NAV.map((item) => {
              const { href, label, icon, leadsBadge } = item;
              const active = activeFor(href);
              const badgeText = badgeFor(item);
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    textDecoration: "none",
                    fontWeight: "500",
                    transition: "all 0.15s",
                    backgroundColor: active ? "rgba(123,94,255,0.12)" : "transparent",
                    color: active ? "#7B5EFF" : "#6B6E85",
                    border: active ? "1px solid rgba(123,94,255,0.2)" : "1px solid transparent",
                  }}
                >
                  <span style={{ fontSize: "15px", lineHeight: "1" }}>{icon}</span>
                  <span style={{ flex: 1 }}>{label}</span>
                  {badgeText ? (
                    <span
                      style={{
                        backgroundColor: leadsBadge ? "#06B6D4" : "#7B5EFF",
                        color: "white",
                        fontSize: "10px",
                        fontWeight: "700",
                        padding: "2px 6px",
                        borderRadius: "99px",
                        minWidth: "18px",
                        textAlign: "center",
                      }}
                    >
                      {badgeText}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1E2030" }}>
          <button
            onClick={logout}
            style={{
              width: "100%",
              marginBottom: "12px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "#A1A4B8",
              borderRadius: "8px",
              padding: "8px 10px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Salir
          </button>
          <div style={{ color: "#6B6E85", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Panel de admin · Halo Agency
          </div>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#10111a]/95 px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:hidden">
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
            className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-3xl border border-white/[0.1] bg-[#151620] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-24px_80px_rgba(0,0,0,0.65)]"
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
            <button
              type="button"
              onClick={logout}
              className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-sm font-bold text-white/70"
            >
              Salir
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
