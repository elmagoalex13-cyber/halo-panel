"use client";

import { useEffect } from "react";

/**
 * Un solo video (o audio) sonando a la vez en TODO el panel y en los portales: cuando uno empieza a reproducirse, se paran los demas.
 * Los eventos de reproduccion no «suben» por el arbol, pero si se pueden escuchar en la fase de captura del documento: asi vale tambien
 * para los videos que aparecen despues (ventanas, listas que se cargan...), sin tocar cada pagina.
 */
export function SoloUnVideo() {
  useEffect(() => {
    const alEmpezar = (e: Event) => {
      const actual = e.target;
      if (!(actual instanceof HTMLMediaElement)) return;
      document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((m) => {
        if (m !== actual && !m.paused) m.pause();
      });
    };
    document.addEventListener("play", alEmpezar, true);
    return () => document.removeEventListener("play", alEmpezar, true);
  }, []);
  return null;
}
