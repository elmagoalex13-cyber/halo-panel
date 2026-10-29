"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Upload } from "lucide-react";
import { agregar, diag, obtener, obtenerServidor, suscribir } from "./subidaVideos";

const ACEPTA = "video/*,.mov,.mp4,.m4v,.3gp,.webm,.mkv,.avi";
const EXT_VIDEO = /\.(mov|mp4|m4v|3gp|3g2|webm|mkv|avi|mpg|mpeg|mts|m2ts)$/i;
const esVideo = (f: File) => f.type.startsWith("video/") || EXT_VIDEO.test(f.name);

/**
 * Boton para elegir videos. La subida la lleva el motor de subidas (subidaVideos.ts) y su avance se ve en la barra fija de abajo (BarraSubidas),
 * asi sigue aunque la modelo cambie de pestaña del portal. Se pueden seguir anadiendo videos mientras otros suben.
 *
 * Funciona igual en cualquier movil (iPhone, Android...): ademas del evento normal del selector, se comprueba el propio campo cada medio segundo por si el
 * navegador no avisa, y si pasa un rato sin recibir nada se ofrece «elegir de otra forma» (un selector sin filtros, el mas basico de todos).
 */
export function SubirBoton({
  tipo,
  encargoId,
  referenciaId,
  etiqueta = "Subir mi video",
}: {
  tipo: number;
  encargoId?: string;
  referenciaId?: string;
  etiqueta?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const alternativo = useRef<HTMLInputElement>(null);
  const [esperando, setEsperando] = useState(false); // ha abierto el selector y todavia no ha llegado ningun video
  const [lento, setLento] = useState(false); // lleva un rato sin que llegue nada
  const [aviso, setAviso] = useState<string | null>(null);
  const abiertoEn = useRef(0);
  const estado = useSyncExternalStore(suscribir, obtener, obtenerServidor);
  const ctx = `${tipo}|${encargoId ?? ""}`;
  const mios = estado.items.filter((i) => i.ctx === ctx && (i.estado === "cola" || i.estado === "subiendo"));
  const total = mios.reduce((s, i) => s + i.size, 0);
  const hecho = mios.reduce((s, i) => s + i.subido, 0);
  const pct = total ? Math.min(100, Math.round((hecho / total) * 100)) : 0;
  const subiendo = mios.length > 0;
  // Un video pendiente concreto (encargo) solo admite un archivo mientras sube
  const bloqueado = Boolean(encargoId) && subiendo;

  // Recibe lo elegido (venga del evento «change», del «input» o de la comprobacion periodica) y lo manda al motor
  function recibir(files: File[], origen: string) {
    if (!files.length) return;
    const validos = files.filter(esVideo);
    const vacios = validos.filter((f) => f.size === 0);
    diag("elegido", { origen, n: files.length, validos: validos.length, vacios: vacios.length, espera_s: Math.round((Date.now() - abiertoEn.current) / 1000), tam: files.map((f) => Math.round(f.size / 1e6)), tipos: files.map((f) => f.type || "?") });
    setEsperando(false);
    setLento(false);
    if (!validos.length) return setAviso("Eso no parece un vídeo. Elige un archivo de vídeo.");
    const buenos = validos.filter((f) => f.size > 0);
    if (!buenos.length) return setAviso("El teléfono no ha podido leer ese vídeo (puede estar solo en iCloud o en otra nube, o estar dañado). Descárgalo al móvil y vuelve a elegirlo.");
    setAviso(vacios.length ? `${vacios.length} vídeo${vacios.length === 1 ? "" : "s"} no se ha podido leer y se ha saltado.` : files.length > validos.length ? "Algún archivo que no era vídeo se ha saltado." : null);
    agregar(buenos, { tipo, encargoId, referenciaId });
  }

  // Red de seguridad: cada medio segundo (hasta 5 minutos tras abrir el selector) se mira si el campo ya tiene archivos aunque el navegador no haya avisado
  useEffect(() => {
    if (!esperando) return;
    const el = input.current;
    const lector = window.setInterval(() => {
      const f = Array.from(el?.files ?? []);
      if (f.length) recibir(f, "comprobacion");
    }, 500);
    const aLaVista = window.setTimeout(() => setLento(true), 20000);
    const fin = window.setTimeout(() => setEsperando(false), 300000);
    return () => {
      window.clearInterval(lector);
      window.clearTimeout(aLaVista);
      window.clearTimeout(fin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperando]);

  // Algunos navegadores del movil avisan con «input» y no con «change»
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const f = () => recibir(Array.from(el.files ?? []), "input");
    el.addEventListener("input", f);
    return () => el.removeEventListener("input", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {/* Etiqueta nativa en vez de input.click(): asi el selector se abre tambien en el movil y en los navegadores de WhatsApp o Instagram */}
      <label className={`btn-primary relative flex h-12 w-full cursor-pointer items-center justify-center overflow-hidden text-base ${bloqueado ? "pointer-events-none opacity-80" : ""}`}>
        <input
          ref={input}
          type="file"
          accept={ACEPTA}
          multiple={!encargoId}
          disabled={bloqueado}
          className="sr-only"
          onClick={() => {
            // Se vacia al ABRIR el selector (no justo al elegir: en el iPhone eso puede invalidar el archivo recien elegido) para poder volver a elegir el mismo video
            if (input.current) input.current.value = "";
            abiertoEn.current = Date.now();
            setAviso(null);
            setLento(false);
            setEsperando(true);
            diag("abrir_selector", { tipo });
          }}
          onChange={(e) => recibir(Array.from(e.target.files ?? []), "change")}
        />
        {subiendo ? (
          <>
            <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${pct}%` }} />
            <span className="relative">
              Subiendo {mios.length > 1 ? `${mios.length} vídeos · ` : ""}
              {pct}%{encargoId ? "" : " · pulsa para añadir más"}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center justify-center gap-2">
            <Upload className="h-4 w-4" aria-hidden="true" />
            {etiqueta}
          </span>
        )}
      </label>
      {esperando && !subiendo ? (
        <div className="mt-2 space-y-2 rounded-xl bg-white/[0.05] px-3 py-2 text-xs leading-relaxed text-white/60">
          <p>
            Elige el vídeo y confírmalo (✓). El móvil puede tardar unos segundos, o más si el vídeo es grande o está en la nube, en prepararlo:{" "}
            <span className="text-white/80">no hace falta que lo vuelvas a elegir, empezará solo</span> y verás una barra abajo.
          </p>
          {lento ? (
            <p>
              ¿Sigue sin empezar?{" "}
              <label className="cursor-pointer font-semibold text-[#C4B5FD] underline">
                Elegir de otra forma
                <input
                  ref={alternativo}
                  type="file"
                  multiple={!encargoId}
                  className="sr-only"
                  onClick={() => {
                    if (alternativo.current) alternativo.current.value = "";
                    diag("abrir_alternativo", { tipo });
                  }}
                  onChange={(e) => recibir(Array.from(e.target.files ?? []), "alternativo")}
                />
              </label>
            </p>
          ) : null}
        </div>
      ) : null}
      {aviso ? <p className="mt-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-100">{aviso}</p> : null}
    </div>
  );
}
