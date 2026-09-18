"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Vuelve a pedir los datos del servidor cada N segundos (mientras la pestana esta visible). */
export function AutoRefresh({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
  return null;
}
