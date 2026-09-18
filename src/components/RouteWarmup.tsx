"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const WARM_ROUTES = [
  "/dashboard",
  "/aprobacion",
  "/instagram",
  "/modelos",
  "/frases",
  "/facturacion",
  "/logs",
  "/vault",
  "/ajustes",
];

export function RouteWarmup() {
  const router = useRouter();

  useEffect(() => {
    const warm = () => {
      WARM_ROUTES.forEach((route) => router.prefetch(route));
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 1800 });
      return () => window.cancelIdleCallback(id);
    }

    const id = globalThis.setTimeout(warm, 700);
    return () => globalThis.clearTimeout(id);
  }, [router]);

  return null;
}
