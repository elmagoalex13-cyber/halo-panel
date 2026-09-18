"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/aprobacion", label: "Aprobación", icon: "⏳", badge: true },
  { href: "/asignar", label: "Asignar vídeos", icon: "⇪" },
  { href: "/instagram", label: "Instagram", icon: "◎" },
  { href: "/modelos", label: "Modelos", icon: "◉" },
  { href: "/frases", label: "Frases", icon: "✦" },
  { href: "/facturacion", label: "Facturación", icon: "◎" },
  { href: "/logs", label: "Actividad", icon: "◌" },
  { href: "/vault", label: "Vault", icon: "◆" },
  { href: "/ajustes", label: "Ajustes", icon: "⚙" },
];

interface SidebarProps {
  pendingAprobacion?: number;
}

export function Sidebar({ pendingAprobacion = 0 }: SidebarProps) {
  const pathname = usePathname();

  return (
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
          {NAV.map(({ href, label, icon, badge }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
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
                {badge && pendingAprobacion > 0 ? (
                  <span
                    style={{
                      backgroundColor: "#7B5EFF",
                      color: "white",
                      fontSize: "10px",
                      fontWeight: "700",
                      padding: "2px 6px",
                      borderRadius: "99px",
                      minWidth: "18px",
                      textAlign: "center",
                    }}
                  >
                    {pendingAprobacion > 99 ? "99+" : pendingAprobacion}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
      <div style={{ padding: "16px 20px", borderTop: "1px solid #1E2030" }}>
        <div style={{ color: "#6B6E85", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          v2.0 · Halo Agency
        </div>
      </div>
    </aside>
  );
}
