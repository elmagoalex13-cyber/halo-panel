"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "library_content",
  "encargos",
  "modelos",
  "cuentas_instagram",
  "referencias",
  "referencias_cuentas",
  "referencias_videos",
  "trial_reels",
  "facturacion_modelos",
  "leads",
  "landing_events",
  "log_agentes",
  "banco_frases_canciones",
  "vault_panel",
  "creator_configs",
];

function canUseBrowserRealtime() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Refresca los datos server-rendered del panel ante cambios de BD, con polling como respaldo. */
export function RealtimeRefresh({ fallbackSegundos = 8 }: { fallbackSegundos?: number }) {
  const router = useRouter();
  const lastRefreshAt = useRef(0);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshAt.current < 1200) return;
      lastRefreshAt.current = now;
      router.refresh();
    };

    const scheduleRefresh = () => {
      if (pending.current) window.clearTimeout(pending.current);
      pending.current = window.setTimeout(() => {
        pending.current = null;
        refresh();
      }, 350);
    };

    const fallback = window.setInterval(refresh, Math.max(3, fallbackSegundos) * 1000);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    let unsubscribe = () => {};

    if (canUseBrowserRealtime()) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );

      const channel = supabase.channel("panel-global-refresh");
      TABLES.forEach((table) => {
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
  }, [fallbackSegundos, router]);

  return null;
}
