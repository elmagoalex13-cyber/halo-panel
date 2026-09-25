"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

function tablesForPath(pathname: string) {
  if (pathname.startsWith("/aprobacion")) return ["library_content"];
  if (pathname.startsWith("/dashboard")) return ["library_content", "modelos", "facturacion_modelos", "cuentas_instagram", "trial_reels"];
  if (pathname.startsWith("/leads")) return ["leads"];
  if (pathname.startsWith("/asignar")) return ["encargos", "referencias", "modelos"];
  if (pathname.startsWith("/instagram")) return ["referencias_cuentas", "referencias_videos", "cuentas_instagram", "modelos"];
  if (pathname.startsWith("/modelos")) return ["modelos", "cuentas_instagram", "encargos", "creator_configs"];
  if (pathname.startsWith("/frases")) return ["banco_frases_canciones"];
  if (pathname.startsWith("/facturacion")) return ["facturacion_modelos"];
  if (pathname.startsWith("/landings")) return ["landing_events"];
  if (pathname.startsWith("/logs")) return ["log_agentes"];
  if (pathname.startsWith("/vault")) return ["vault_panel"];
  return [];
}

function canUseBrowserRealtime() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function hasOpenModal() {
  return Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]'));
}

/** Refresca los datos server-rendered del panel ante cambios de BD, con polling como respaldo. */
export function RealtimeRefresh({ fallbackSegundos = 8 }: { fallbackSegundos?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const lastRefreshAt = useRef(0);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    const tables = tablesForPath(pathname);

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (hasOpenModal()) return;
      const now = Date.now();
      if (now - lastRefreshAt.current < 3000) return;
      lastRefreshAt.current = now;
      router.refresh();
    };

    const scheduleRefresh = () => {
      if (pending.current) window.clearTimeout(pending.current);
      pending.current = window.setTimeout(() => {
        pending.current = null;
        refresh();
      }, 750);
    };

    const fallback = window.setInterval(refresh, Math.max(20, fallbackSegundos) * 1000);
    const onFocus = () => {
      if (Date.now() - lastRefreshAt.current > 15000) refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshAt.current > 15000) refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    let unsubscribe = () => {};

    if (canUseBrowserRealtime() && tables.length > 0) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );

      const channel = supabase.channel(`panel-refresh-${pathname.replace(/[^a-z0-9]/gi, "-") || "home"}`);
      tables.forEach((table) => {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          scheduleRefresh,
        );
      });
      channel.subscribe();
      unsubscribe = () => {
        supabase.removeChannel(channel);
      };
    }

    return () => {
      window.clearInterval(fallback);
      if (pending.current) window.clearTimeout(pending.current);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [fallbackSegundos, pathname, router]);

  return null;
}
